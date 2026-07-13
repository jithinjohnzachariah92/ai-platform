import { onEvent, clearSubscribers } from '@jz92/ai-core'
import type { PlatformEvent } from '@jz92/ai-core'
import { createAtlasVectorStore } from '../src/lib/atlas.js'
import type { AtlasCollection } from '../src/lib/types.js'

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

// ── Fake Atlas collection — satisfies the structural type, no real DB needed ──

const makeFakeCollection = (overrides: Partial<AtlasCollection> = {}): AtlasCollection => ({
  insertOne: async () => ({ acknowledged: true }),
  deleteOne: async () => ({ acknowledged: true, deletedCount: 1 }),
  aggregate: () => ({
    toArray: async () => [
      { input: 'I love Nike', output: '{"brands":[{"name":"Nike","optedIn":true}]}', model: 'voyage-4-lite', modelVersion: 'voyage-4-lite', createdAt: new Date(), score: 0.9 },
    ],
  }),
  ...overrides,
})

const collectEvents = (): { events: PlatformEvent[]; stop: () => void } => {
  const events: PlatformEvent[] = []
  const unsubscribe = onEvent((e) => events.push(e))
  return { events, stop: unsubscribe }
}

// ── insert() ───────────────────────────────────────────────────────────────────
console.log('\ninsert()')
{
  clearSubscribers()
  const { events, stop } = collectEvents()

  const store = createAtlasVectorStore({
    getCollection: async () => makeFakeCollection(),
    vectorIndexName: 'test_idx',
  })

  await store.insert({
    embedding: [0.1, 0.2, 0.3],
    input: 'test input',
    output: '{"test":true}',
    model: 'voyage-4-lite',
    modelVersion: 'voyage-4-lite',
  }, 'trace-1')

  const successEvent = events.find(e => e.type === 'insert.success')
  log(successEvent !== undefined, 'emits insert.success on successful insert')
  log(successEvent?.traceId === 'trace-1', 'insert event carries traceId')
  log(typeof successEvent?.durationMs === 'number', 'insert event carries durationMs')

  stop()
}

// ── insert() failure path ──────────────────────────────────────────────────────
console.log('\ninsert() failure path')
{
  clearSubscribers()
  const { events, stop } = collectEvents()

  const store = createAtlasVectorStore({
    getCollection: async () => makeFakeCollection({
      insertOne: async () => { throw new Error('connection lost') },
    }),
    vectorIndexName: 'test_idx',
  })

  try {
    await store.insert({ embedding: [0.1], input: 'x', output: 'y', model: 'm', modelVersion: 'm' })
    log(false, 'insert failure propagates the error')
  } catch {
    log(true, 'insert failure propagates the error')
  }

  const failureEvent = events.find(e => e.type === 'insert.failure')
  log(failureEvent !== undefined, 'emits insert.failure on error')

  stop()
}

// ── search() ───────────────────────────────────────────────────────────────────
console.log('\nsearch()')
{
  clearSubscribers()
  const { events, stop } = collectEvents()

  const store = createAtlasVectorStore({
    getCollection: async () => makeFakeCollection(),
    vectorIndexName: 'test_idx',
  })

  const results = await store.search({ embedding: [0.1, 0.2, 0.3], topK: 3 }, 'trace-2')

  log(results.length === 1, 'returns results from the fake collection')
  log(results[0].score === 0.9, 'result carries the similarity score')
  log(results[0].entry.input === 'I love Nike', 'result carries the stored input')

  const successEvent = events.find(e => e.type === 'search.success')
  log(successEvent !== undefined, 'emits search.success when results are found')
  log((successEvent as any)?.topScore === 0.9, 'search event carries topScore')

  stop()
}

// ── search() empty results ─────────────────────────────────────────────────────
console.log('\nsearch() empty results')
{
  clearSubscribers()
  const { events, stop } = collectEvents()

  const store = createAtlasVectorStore({
    getCollection: async () => makeFakeCollection({
      aggregate: () => ({ toArray: async () => [] }),
    }),
    vectorIndexName: 'test_idx',
  })

  const results = await store.search({ embedding: [0.1], topK: 3 })
  log(results.length === 0, 'returns empty array when nothing found')

  const emptyEvent = events.find(e => e.type === 'search.empty')
  log(emptyEvent !== undefined, 'emits search.empty (not search.success) when nothing found')

  stop()
}

// ── search() threshold filtering ───────────────────────────────────────────────
console.log('\nsearch() threshold filtering')
{
  clearSubscribers()
  const store = createAtlasVectorStore({
    getCollection: async () => makeFakeCollection({
      aggregate: () => ({
        toArray: async () => [
          { input: 'weak match', output: '{}', model: 'm', modelVersion: 'm', createdAt: new Date(), score: 0.3 },
        ],
      }),
    }),
    vectorIndexName: 'test_idx',
  })

  const results = await store.search({ embedding: [0.1], topK: 3, threshold: 0.7 })
  log(results.length === 0, 'filters out results below threshold')
}

// ── delete() ───────────────────────────────────────────────────────────────────
console.log('\ndelete()')
{
  clearSubscribers()
  const { events, stop } = collectEvents()

  const store = createAtlasVectorStore({
    getCollection: async () => makeFakeCollection(),
    vectorIndexName: 'test_idx',
  })

  await store.delete('some-id', 'trace-3')

  const deleteEvent = events.find(e => e.type === 'delete.success')
  log(deleteEvent !== undefined, 'emits delete.success on successful delete')
  log(deleteEvent?.traceId === 'trace-3', 'delete event carries traceId')

  stop()
}

// ── Summary ────────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────')
console.log(`  ${passed} passed  ${failed > 0 ? `${failed} failed` : ''}`)
console.log('────────────────────────────────────────\n')

process.exit(failed > 0 ? 1 : 0)