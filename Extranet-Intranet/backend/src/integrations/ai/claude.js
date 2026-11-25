import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'

/**
 * Claude (Anthropic) for the AI assistant. Off until ANTHROPIC_API_KEY is set.
 * Every call asks for structured JSON (validated with zod) and uses Anthropic's
 * server-side fallback, so a safety decline is retried on the recommended model.
 */

const DEFAULT_MODEL = 'claude-opus-5-5'
let client = null

export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim())
export const aiModel = () => process.env.AI_MODEL?.trim() || DEFAULT_MODEL

function anthropic() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY.trim(), timeout: 90 * 1000, maxRetries: 2 })
  return client
}

/** For tests: drops the cached client so a new key or fake transport is used. */
export function resetAiClient() {
  client = null
}

const fail = (status, message) => Object.assign(new Error(message), { status })

/**
 * One request → one validated JSON object.
 * @param {{ system: string, content: Anthropic.Beta.BetaContentBlockParam[] | string, schema: import('zod').ZodType, effort?: string, maxTokens?: number }} options
 */
export async function askClaude({ system, content, schema, effort = 'medium', maxTokens = 4000 }) {
  if (!aiConfigured()) throw fail(503, 'The AI assistant is not configured yet.')
  const format = zodOutputFormat(schema)
  let response
  try {
    response = await anthropic().beta.messages.create({
      model: aiModel(),
      max_tokens: maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      messages: [{ role: 'user', content }],
      output_config: { effort, format },
    })
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) throw fail(503, 'The AI assistant key was refused. Check ANTHROPIC_API_KEY.')
    if (error instanceof Anthropic.RateLimitError) throw fail(429, 'The AI assistant is busy. Try again in a minute.')
    if (error instanceof Anthropic.BadRequestError) throw fail(400, 'The AI assistant could not read this content.')
    if (error instanceof Anthropic.APIError || error instanceof Anthropic.APIConnectionError) throw fail(502, 'The AI assistant could not be reached. Try again later.')
    throw error
  }
  if (response.stop_reason === 'refusal') throw fail(422, 'The AI assistant declined this request.')
  if (response.stop_reason === 'max_tokens') throw fail(502, 'The AI answer was too long. Try a smaller document.')
  const text = response.content.filter((block) => block.type === 'text').map((block) => block.text).join('')
  let data
  try {
    data = format.parse(text)
  } catch {
    throw fail(502, 'The AI answer could not be read. Try again.')
  }
  return {
    data,
    model: response.model,
    usage: { input_tokens: response.usage?.input_tokens ?? 0, output_tokens: response.usage?.output_tokens ?? 0 },
  }
}
