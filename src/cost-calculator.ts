export interface TokenBreakdown {
  input: number
  output: number
  reasoning: number
  cache: { read: number; write: number }
}

export interface CostRates {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  over200k?: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
  }
}

function sanitizeTokenCount(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0
  }
  return value
}

function getEffectiveRates(
  rates: CostRates,
  contextUsed?: number
): Pick<CostRates, "input" | "output" | "cacheRead" | "cacheWrite"> {
  if (contextUsed !== undefined && contextUsed > 200_000 && rates.over200k !== undefined) {
    return rates.over200k
  }
  return rates
}

export function calculateTokenCost(
  tokens: TokenBreakdown,
  rates: CostRates,
  contextUsed?: number
): number {
  const effectiveRates = getEffectiveRates(rates, contextUsed)

  const inputTokens = sanitizeTokenCount(tokens.input)
  const outputTokens = sanitizeTokenCount(tokens.output)
  const reasoningTokens = sanitizeTokenCount(tokens.reasoning)
  const cacheReadTokens = sanitizeTokenCount(tokens.cache.read)
  const cacheWriteTokens = sanitizeTokenCount(tokens.cache.write)

  const inputCost = inputTokens * effectiveRates.input
  const outputCost = outputTokens * effectiveRates.output
  const reasoningCost = reasoningTokens * effectiveRates.output
  const cacheReadCost = cacheReadTokens * effectiveRates.cacheRead
  const cacheWriteCost = cacheWriteTokens * effectiveRates.cacheWrite

  return inputCost + outputCost + reasoningCost + cacheReadCost + cacheWriteCost
}

export function resolveMessageCost(
  messageCost: number,
  tokens: TokenBreakdown,
  rates: CostRates | null,
  contextUsed?: number
): number {
  if (messageCost > 0) {
    return messageCost
  }

  if (rates !== null) {
    return calculateTokenCost(tokens, rates, contextUsed)
  }

  return 0
}
