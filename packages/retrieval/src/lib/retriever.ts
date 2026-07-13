import { emit } from '@jz92/ai-core'
import type { AIEnvironment } from '@jz92/ai-core'
import type { RetrieverConfig, QualityGate, RetrieveResult, StoreOptions } from './types.js'

const estimateTokens = (text: string): number => Math.ceil(text.length / 4)

const getEnv = (): AIEnvironment =>
  (process.env.NODE_ENV as AIEnvironment) ?? 'development'

export const createRetriever = <T>(config: RetrieverConfig<T>) => {
  const { vectorStore, embed, topK, formatExample, parseOutput, minScore = 0, maxExampleTokens } = config

  const retrieve = async (input: string, traceId?: string): Promise<RetrieveResult> => {
    const start = Date.now()

    try {
      const { embedding } = await embed(input, 'query', traceId)
      const results = await vectorStore.search({ embedding, topK }, traceId)
      const relevant = results.filter((r) => r.score >= minScore)

      if (relevant.length === 0) {
        emit({
          source: 'retrieval', type: 'retrieved', traceId: traceId ?? '',
          timestamp: new Date().toISOString(), durationMs: Date.now() - start,
          env: getEnv(), count: 0,
        })
        return { fewShotText: '', exampleCount: 0 }
      }

      const formatted: string[] = []
      let tokenCount = 0

      for (const r of relevant) {
        const output  = parseOutput(r.entry.output)
        const example = formatExample(r.entry.input, output)
        const cost    = estimateTokens(example)

        if (maxExampleTokens !== undefined && tokenCount + cost > maxExampleTokens) break

        formatted.push(example)
        tokenCount += cost
      }

      const fewShotText = formatted.length === 0
        ? ''
        : `\nHere are some examples of similar inputs and their correct outputs:\n\n${formatted.join('\n\n')}\n\nUse these as reference for the extraction below.`

      emit({
        source: 'retrieval', type: 'retrieved', traceId: traceId ?? '',
        timestamp: new Date().toISOString(), durationMs: Date.now() - start,
        env: getEnv(), count: formatted.length, topScore: relevant[0]?.score,
      })

      return { fewShotText, exampleCount: formatted.length, topScore: relevant[0]?.score }

    } catch (err) {
      emit({
        source: 'retrieval', type: 'quality.gate.failed', traceId: traceId ?? '',
        timestamp: new Date().toISOString(), durationMs: Date.now() - start,
        env: getEnv(), reason: `retrieval failed: ${String(err)}`,
      })
      return { fewShotText: '', exampleCount: 0 }
    }
  }

  const store = async (
    input: string,
    output: T,
    qualityGate: QualityGate<T>,
    options: StoreOptions,
    traceId?: string
  ): Promise<void> => {
    const gateStart = Date.now()
    const passed = qualityGate(output)
    const gateDurationMs = Date.now() - gateStart

    if (!passed) {
      emit({
        source: 'retrieval', type: 'quality.gate.failed', traceId: traceId ?? '',
        timestamp: new Date().toISOString(), durationMs: gateDurationMs,
        env: getEnv(), reason: 'did not pass domain quality gate',
      })
      return
    }

    emit({
      source: 'retrieval', type: 'quality.gate.passed', traceId: traceId ?? '',
      timestamp: new Date().toISOString(), durationMs: gateDurationMs,
      env: getEnv(),
    })

    const storeStart = Date.now()
    try {
      const { embedding } = await embed(input, 'document', traceId)

      await vectorStore.insert({
        embedding,
        input,
        output:       JSON.stringify(output),
        model:        options.model,
        modelVersion: options.modelVersion,
      }, traceId)

      emit({
        source: 'retrieval', type: 'store.success', traceId: traceId ?? '',
        timestamp: new Date().toISOString(), durationMs: Date.now() - storeStart,
        env: getEnv(),
      })

    } catch (err) {
      emit({
        source: 'retrieval', type: 'store.failure', traceId: traceId ?? '',
        timestamp: new Date().toISOString(), durationMs: Date.now() - storeStart,
        env: getEnv(), reason: String(err),
      })
    }
  }

  return { retrieve, store }
}