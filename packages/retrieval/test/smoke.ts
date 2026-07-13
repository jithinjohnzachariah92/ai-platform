import { onEvent, clearSubscribers } from '@jz92/ai-core'
import type { PlatformEvent, VectorStore, VectorSearchResult } from '@jz92/ai-core'
import { createRetriever } from '../src/lib/retriever.js'

let passed = 0
let failed = 0

const log = (condition: boolean, label: string, detail?: string) => {
  if (condition) {
    console.log(`  ✓  ${label}`)
    passed++
  } else {
    console.log(`  ✗  ${label}${detail ? `\n     ${detail}` : ''}`)
    failed++
  }
}

// ── Fakes — fully isolated, no real API calls or DB ────────────────────────────

type TestOutput = { brands: { name: string; optedIn: boolean }[] }

const fakeEmbed = async (text: string, inputType: 'query' | 'document') => ({
  embedding: [0.1, 0.2, 0.3],
  model: 'fake-model',
  provider: 'voyage' as const,
})

const makeFakeVectorStore = (searchResults: VectorSearchResult[] = []): VectorStore => ({
  insert: async () => {},
  search: async () => searchResults,
  delete: async () => {},
})

const fakeResult = (input: string, output: TestOutput, score: number): VectorSearchResult => ({
  entry: { embedding: [], input, output: JSON.stringify(output), model: 'm', modelVersion: 'm' },
  score,
})

const collectEvents = (): { events: PlatformEvent[]; stop: () => void } => {
  const events: PlatformEvent[] = []
  const unsubscribe = onEvent((e) => events.push(e))
  return { events, stop: unsubscribe }
}

const formatExample = (input: string, output: TestOutput) =>
  `Input: "${input}"\nOutput: ${JSON.stringify(output)}`
const parseOutput = (raw: string): TestOutput => JSON.parse(raw)

// ── retrieve() — no results ────────────────────────────────────────────────────
console.log('\nretrieve() — no results')
{
  clearSubscribers()
  const { events, stop } = collectEvents()

  const retriever = createRetriever<TestOutput>({
    vectorStore: makeFakeVectorStore([]),
    embed: fakeEmbed,
    topK: 3,
    formatExample,
    parseOutput,
  })

  const result = await retriever.retrieve('new input', 'trace-1')
  log(result.fewShotText === '', 'empty store returns empty fewShotText')
  log(result.exampleCount === 0, 'empty store returns exampleCount 0')

  const event = events.find(e => e.type === 'retrieved')
  log(event !== undefined, 'emits retrieved event even with zero results')
  log((event as any)?.count === 0, 'retrieved event reports count 0')

  stop()
}

// ── retrieve() — with results ──────────────────────────────────────────────────
console.log('\nretrieve() — with results')
{
  clearSubscribers()
  const { events, stop } = collectEvents()

  const retriever = createRetriever<TestOutput>({
    vectorStore: makeFakeVectorStore([
      fakeResult('I love Nike', { brands: [{ name: 'Nike', optedIn: true }] }, 0.9),
    ]),
    embed: fakeEmbed,
    topK: 3,
    formatExample,
    parseOutput,
  })

  const result = await retriever.retrieve('I love Nike trainers', 'trace-2')
  log(result.exampleCount === 1, 'returns one formatted example')
  log(result.fewShotText.includes('I love Nike'), 'fewShotText contains the retrieved input')
  log(result.fewShotText.includes('Nike'), 'fewShotText contains the retrieved output')
  log(result.topScore === 0.9, 'returns the top score')

  const event = events.find(e => e.type === 'retrieved')
  log((event as any)?.topScore === 0.9, 'retrieved event carries topScore')

  stop()
}

// ── retrieve() — score threshold guardrail ─────────────────────────────────────
console.log('\nretrieve() — score threshold guardrail')
{
  clearSubscribers()
  const retriever = createRetriever<TestOutput>({
    vectorStore: makeFakeVectorStore([
      fakeResult('weak match', { brands: [] }, 0.4),
    ]),
    embed: fakeEmbed,
    topK: 3,
    formatExample,
    parseOutput,
    minScore: 0.7,
  })

  const result = await retriever.retrieve('some input')
  log(result.exampleCount === 0, 'filters out results below minScore')
  log(result.fewShotText === '', 'no few-shot text when everything is below threshold')
}

// ── retrieve() — token budget guardrail ────────────────────────────────────────
console.log('\nretrieve() — token budget guardrail')
{
  clearSubscribers()
  const longOutput = { brands: Array(50).fill({ name: 'Nike', optedIn: true }) }

  const retriever = createRetriever<TestOutput>({
    vectorStore: makeFakeVectorStore([
      fakeResult('input one', longOutput, 0.9),
      fakeResult('input two', longOutput, 0.85),
      fakeResult('input three', longOutput, 0.8),
    ]),
    embed: fakeEmbed,
    topK: 3,
    formatExample,
    parseOutput,
    maxExampleTokens: 50,  // small budget — should cut off before all 3 fit
  })

  const result = await retriever.retrieve('some input')
  log(result.exampleCount < 3, 'token budget stops before including all available examples')
}

// ── store() — quality gate passes ──────────────────────────────────────────────
console.log('\nstore() — quality gate passes')
{
  clearSubscribers()
  const { events, stop } = collectEvents()

  const retriever = createRetriever<TestOutput>({
    vectorStore: makeFakeVectorStore(),
    embed: fakeEmbed,
    topK: 3,
    formatExample,
    parseOutput,
  })

  await retriever.store(
    'I love Nike',
    { brands: [{ name: 'Nike', optedIn: true }] },
    (output) => output.brands.length > 0,   // quality gate: must have at least one brand
    { model: 'fake-model', modelVersion: 'fake-model' },
    'trace-3'
  )

  const gatePassedEvent = events.find(e => e.type === 'quality.gate.passed')
  const storeSuccessEvent = events.find(e => e.type === 'store.success')
  log(gatePassedEvent !== undefined, 'emits quality.gate.passed when gate passes')
  log(storeSuccessEvent !== undefined, 'emits store.success after successful insert')
  log(storeSuccessEvent?.traceId === 'trace-3', 'store.success event carries traceId')

  stop()
}

// ── store() — quality gate fails ───────────────────────────────────────────────
console.log('\nstore() — quality gate fails')
{
  clearSubscribers()
  const { events, stop } = collectEvents()

  const retriever = createRetriever<TestOutput>({
    vectorStore: makeFakeVectorStore(),
    embed: fakeEmbed,
    topK: 3,
    formatExample,
    parseOutput,
  })

  await retriever.store(
    'unclear input',
    { brands: [] },
    (output) => output.brands.length > 0,   // gate: fails on empty brands
    { model: 'fake-model', modelVersion: 'fake-model' },
    'trace-4'
  )

  const gateFailedEvent = events.find(e => e.type === 'quality.gate.failed')
  const storeSuccessEvent = events.find(e => e.type === 'store.success')
  log(gateFailedEvent !== undefined, 'emits quality.gate.failed when gate rejects')
  log(storeSuccessEvent === undefined, 'never attempts to store when gate rejects')

  stop()
}

// ── store() — insert failure is caught, never thrown to caller ────────────────
console.log('\nstore() — insert failure handling')
{
  clearSubscribers()
  const { events, stop } = collectEvents()

  const failingStore: VectorStore = {
    insert: async () => { throw new Error('DB connection lost') },
    search: async () => [],
    delete: async () => {},
  }

  const retriever = createRetriever<TestOutput>({
    vectorStore: failingStore,
    embed: fakeEmbed,
    topK: 3,
    formatExample,
    parseOutput,
  })

  let threw = false
  try {
    await retriever.store(
      'I love Nike',
      { brands: [{ name: 'Nike', optedIn: true }] },
      () => true,
      { model: 'm', modelVersion: 'm' }
    )
  } catch {
    threw = true
  }

  log(!threw, 'store failure never throws to the caller (fire-and-forget semantics)')
  const failureEvent = events.find(e => e.type === 'store.failure')
  log(failureEvent !== undefined, 'emits store.failure when insert throws')

  stop()
}

// ── Summary ────────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────')
console.log(`  ${passed} passed  ${failed > 0 ? `${failed} failed` : ''}`)
console.log('────────────────────────────────────────\n')

process.exit(failed > 0 ? 1 : 0)