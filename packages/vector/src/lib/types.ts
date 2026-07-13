import type { VectorStore } from '@jz92/ai-core'

// ── Atlas-specific config ─────────────────────────────────────────────────────
// This is the ONE place Atlas-specific knowledge lives. VectorStore itself
// (imported above from ai-core) knows nothing about Atlas, indexes, or
// $vectorSearch — this file exists to implement that contract for MongoDB.

export type AtlasVectorStoreConfig = {
  // Caller supplies how to get the collection — package never imports a DB
  // connection utility directly. This is what keeps @jz92/vector infra-agnostic.
  getCollection: () => Promise<AtlasCollection>
  vectorIndexName: string
  // numCandidates = topK * this multiplier — wider search pool for accuracy.
  // Default 4 is right-sized for small stores; raise for large ones.
  candidateMultiplier?: number
}

// Minimal structural type for what we need from a MongoDB collection —
// avoids depending on the full `mongodb` or `mongoose` package types directly.
export type AtlasCollection = {
  insertOne: (doc: Record<string, unknown>) => Promise<unknown>
  deleteOne: (filter: Record<string, unknown>) => Promise<unknown>
  aggregate: (pipeline: Record<string, unknown>[]) => {
    toArray: () => Promise<Record<string, unknown>[]>
  }
}

export type { VectorStore }