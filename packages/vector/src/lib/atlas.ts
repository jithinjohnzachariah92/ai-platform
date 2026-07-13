import { emit } from '@jz92/ai-core'
import type { VectorStore, VectorEntry, VectorQuery, VectorSearchResult, AIEnvironment } from '@jz92/ai-core'
import type { AtlasVectorStoreConfig } from './types.js'

// ── createAtlasVectorStore ────────────────────────────────────────────────────
// Implements the generic VectorStore contract for MongoDB Atlas Vector Search.
// This is the ONLY file in the package that knows about $vectorSearch,
// collections, or Atlas index names — everything else in the platform depends
// on the VectorStore interface, never on this implementation directly.

const DEFAULT_CANDIDATE_MULTIPLIER = 4

const getEnv = (): AIEnvironment =>
  (process.env.NODE_ENV as AIEnvironment) ?? 'development'

export const createAtlasVectorStore = (
  config: AtlasVectorStoreConfig
): VectorStore => {
  const { getCollection, vectorIndexName, candidateMultiplier = DEFAULT_CANDIDATE_MULTIPLIER } = config

  return {
    insert: async (entry: VectorEntry, traceId?: string): Promise<void> => {
      const start = Date.now()
      try {
        const collection = await getCollection()
        await collection.insertOne({
          embedding:    entry.embedding,
          input:        entry.input,
          output:       entry.output,
          model:        entry.model,
          modelVersion: entry.modelVersion,
          createdAt:    entry.createdAt ?? new Date(),
        })

        emit({
          source:     'vector',
          type:       'insert.success',
          traceId:    traceId ?? '',
          timestamp:  new Date().toISOString(),
          durationMs: Date.now() - start,
          env:        getEnv(),
          table:      vectorIndexName,
          model:      entry.model,
          dimensions: entry.embedding.length,
        })

      } catch (err) {
        emit({
          source:     'vector',
          type:       'insert.failure',
          traceId:    traceId ?? '',
          timestamp:  new Date().toISOString(),
          durationMs: Date.now() - start,
          env:        getEnv(),
          table:      vectorIndexName,
          error:      { code: 'UNKNOWN', message: String(err) },
        })
        throw err
      }
    },

    search: async (query: VectorQuery, traceId?: string): Promise<VectorSearchResult[]> => {
      const start = Date.now()
      try {
        const collection = await getCollection()

        const pipeline: Record<string, unknown>[] = [
          {
            $vectorSearch: {
              index:         vectorIndexName,
              path:          'embedding',
              queryVector:   query.embedding,
              numCandidates: query.topK * candidateMultiplier,
              limit:         query.topK,
              ...(query.filter ? { filter: query.filter } : {}),
            },
          },
          {
            $project: {
              input:        1,
              output:       1,
              model:        1,
              modelVersion: 1,
              createdAt:    1,
              score:        { $meta: 'vectorSearchScore' },
              _id:          0,
            },
          },
        ]

        const rawResults = await collection.aggregate(pipeline).toArray()

        const results: VectorSearchResult[] = rawResults
          .filter((r) => query.threshold === undefined || (r.score as number) >= query.threshold)
          .map((r) => ({
            entry: {
              embedding:    [],  // not returned by the query — not needed by the caller
              input:        r.input as string,
              output:       r.output as string,
              model:        r.model as string,
              modelVersion: r.modelVersion as string,
              createdAt:    r.createdAt as Date,
            },
            score: r.score as number,
          }))

        emit({
          source:     'vector',
          type:       results.length === 0 ? 'search.empty' : 'search.success',
          traceId:    traceId ?? '',
          timestamp:  new Date().toISOString(),
          durationMs: Date.now() - start,
          env:        getEnv(),
          table:      vectorIndexName,
          topK:       query.topK,
          returned:   results.length,
          topScore:   results[0]?.score,
        })

        return results

      } catch (err) {
        emit({
          source:     'vector',
          type:       'search.failure',
          traceId:    traceId ?? '',
          timestamp:  new Date().toISOString(),
          durationMs: Date.now() - start,
          env:        getEnv(),
          table:      vectorIndexName,
          topK:       query.topK,
          error:      { code: 'UNKNOWN', message: String(err) },
        })
        throw err
      }
    },

    delete: async (id: string, traceId?: string): Promise<void> => {
      const start = Date.now()
      try {
        const collection = await getCollection()
        await collection.deleteOne({ _id: id })

        emit({
          source:     'vector',
          type:       'delete.success',
          traceId:    traceId ?? '',
          timestamp:  new Date().toISOString(),
          durationMs: Date.now() - start,
          env:        getEnv(),
          table:      vectorIndexName,
        })

      } catch (err) {
        emit({
          source:     'vector',
          type:       'delete.failure',
          traceId:    traceId ?? '',
          timestamp:  new Date().toISOString(),
          durationMs: Date.now() - start,
          env:        getEnv(),
          table:      vectorIndexName,
          error:      { code: 'UNKNOWN', message: String(err) },
        })
        throw err
      }
    },
  }
}