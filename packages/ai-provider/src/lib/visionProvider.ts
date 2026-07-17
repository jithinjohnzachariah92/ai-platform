import { resolveEnvironment } from './provider.js'
import type { ProviderConfig } from './types.js'
import type { AIProviderName, AIEnvironment } from '@jz92/ai-core'

// ── resolveVisionProvider ─────────────────────────────────────────────────────
// Mirrors resolveProvider() exactly, but the Ollama default is a vision-capable
// model (llava) rather than the coding model used for completions — qwen2.5-coder
// has no image support at all. Cloud providers (Claude Sonnet) already handle
// vision natively with the same model used for completions — no override needed
// there.

export function resolveVisionProvider(): ProviderConfig {
  const env = resolveEnvironment()
  const providerOverride = process.env.AI_VISION_PROVIDER as AIProviderName | undefined
  const modelOverride = process.env.AI_VISION_MODEL

  if (providerOverride && providerOverride !== 'ollama') {
    return buildCloudVisionConfig(providerOverride, env, modelOverride)
  }
  if (providerOverride === 'ollama') {
    return buildOllamaVisionConfig(modelOverride)
  }

  switch (env) {
    case 'development': return buildOllamaVisionConfig(modelOverride)
    case 'test':         return buildCloudVisionConfig('anthropic', 'test', modelOverride)
    case 'production':   return buildCloudVisionConfig('anthropic', 'production', modelOverride)
  }
}

function buildOllamaVisionConfig(modelOverride?: string): ProviderConfig {
  return {
    provider: 'ollama',
    model: modelOverride ?? process.env.OLLAMA_VISION_MODEL ?? 'llava',
    baseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
    maxTokens: 2048,
    usePromptCache: false,
    env: 'development',
  }
}

function buildCloudVisionConfig(
  provider: Exclude<AIProviderName, 'ollama'>,
  env: AIEnvironment,
  modelOverride?: string
): ProviderConfig {
  const isTest = env === 'test'
  // Reuse the same Claude models as completions — Sonnet/Haiku both handle
  // vision natively, no separate vision-tuned model needed on the cloud side.
  const defaults: Record<string, { test: string; production: string }> = {
    anthropic: { test: 'claude-haiku-4-5-20251001', production: 'claude-sonnet-4-6' },
  }

  return {
    provider,
    model: modelOverride ?? defaults[provider]?.[isTest ? 'test' : 'production'] ?? 'claude-sonnet-4-6',
    maxTokens: isTest ? 512 : 1024,
    usePromptCache: false,   // images aren't cached the same way; keep simple for now
    env,
  }
}