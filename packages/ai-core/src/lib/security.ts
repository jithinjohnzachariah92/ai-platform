// ── PII Redaction ─────────────────────────────────────────────────────────────
// Applied before text hits a model, before it's stored in pgvector, and before
// it appears in emitted events. Call redact() on any user-supplied text that
// travels outside the application boundary.
//
// Built-in patterns cover common UK + international PII. Pass extraPatterns
// to add domain-specific patterns (e.g. M&S loyalty card numbers).

const DEFAULT_PII_PATTERNS: RegExp[] = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,         // email
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,         // credit card
  /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi,             // UK postcode
  /\b(\+44|0)[\s-]?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}\b/g, // UK phone
  /\b\d{9}\b/g,                                            // NHS number
]

export const redact = (
  text: string,
  extraPatterns: RegExp[] = []
): string => {
  let result = text
  for (const pattern of [...DEFAULT_PII_PATTERNS, ...extraPatterns]) {
    result = result.replace(pattern, '[REDACTED]')
  }
  return result
}

// Redact sensitive fields from an object before emitting to external sinks.
// Use this before sending events to Datadog, OpenTelemetry, or any third-party.
export const redactFields = <T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[]
): T => ({
  ...obj,
  ...Object.fromEntries(
    fields.map(f => [f, obj[f] !== undefined ? '[REDACTED]' : undefined])
  ),
}) as T

// ── Prompt Injection Detection ────────────────────────────────────────────────
// Detects attempts to override system instructions in user-supplied text.
// Call assertSafeInput() on any user input before passing it to a model.
//
// This is a first-line defence, not a complete solution — sophisticated
// injections may evade pattern matching. Pair with output validation (Zod,
// whitelist normaliser) as a second layer of defence.

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /disregard\s+(all\s+)?(previous|prior|above)/i,
  /you\s+are\s+now\s+/i,
  /forget\s+(everything|all)/i,
  /new\s+instructions?\s*:/i,
  /system\s*prompt\s*:/i,
  /\[SYSTEM\]/i,
  /<\s*system\s*>/i,
]

// Returns true if the text looks like a prompt injection attempt.
// Use detectInjection() when you want to handle it yourself.
export const detectInjection = (text: string): boolean =>
  INJECTION_PATTERNS.some(p => p.test(text))

// Throws if injection is detected.
// Use assertSafeInput() as a guard at the start of any function
// that passes user text to a model.
export const assertSafeInput = (
  text: string,
  field = 'input'
): void => {
  if (detectInjection(text)) {
    throw new Error(
      `[ai-core] Potential prompt injection detected in ${field}. ` +
      `Input contained patterns that attempt to override system instructions.`
    )
  }
}

// ── Secret Scrubbing ──────────────────────────────────────────────────────────
// Prevents API keys, tokens, and bearer headers appearing in emitted events,
// logs, or error messages. Call scrubSecrets() on any string before it reaches
// an external logging sink (Datadog, OpenTelemetry, console in prod).
//
// Applied automatically by the event bus before emitting — but also exported
// so domain code can scrub arbitrary strings (e.g. error messages that may
// contain credentials from environment variable dumps).

const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[a-zA-Z0-9\-_]{20,}/g,    // Anthropic API key
  /sk-[a-zA-Z0-9]{20,}/g,            // OpenAI API key
  /pa-[a-zA-Z0-9]{20,}/g,            // Voyage API key
  /Bearer\s+[a-zA-Z0-9\-_.]{10,}/g,  // Bearer token (any provider)
  /[a-zA-Z0-9]{32,}/g,               // Generic long token (catch-all, last resort)
]

export const scrubSecrets = (text: string): string => {
  let result = text
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, '[SECRET]')
  }
  return result
}

// Scrub secrets from all string values in an object — useful for sanitising
// error objects or environment dumps before logging.
export const scrubObject = (
  obj: Record<string, unknown>
): Record<string, unknown> => {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = scrubSecrets(value)
    } else if (typeof value === 'object' && value !== null) {
      result[key] = scrubObject(value as Record<string, unknown>)
    } else {
      result[key] = value
    }
  }
  return result
}