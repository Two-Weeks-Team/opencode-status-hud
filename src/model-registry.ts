export interface ModelCostRates {
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

export interface ModelLimits {
  context: number
  output: number
}

export interface ModelRegistryEntry {
  providerID: string
  modelID: string
  cost: ModelCostRates | null
  limit: ModelLimits
}

export interface ModelRegistry {
  get(providerID: string, modelID: string): ModelRegistryEntry | null
  set(entry: ModelRegistryEntry): void
  resolveContextLimit(modelID: string, providerID?: string): number
  populateFromProviderList(response: ProviderListResponse): void
  updateFromChatParams(model: ChatParamsModel, providerCtx: ChatParamsProviderCtx): void
  snapshot(): ModelRegistryEntry[]
  restore(entries: ModelRegistryEntry[]): void
}

export interface ProviderListResponse {
  all: Array<{
    id: string
    models: {
      [modelID: string]: {
        cost?: {
          input: number
          output: number
          cache_read?: number
          cache_write?: number
          context_over_200k?: {
            input: number
            output: number
            cache_read?: number
            cache_write?: number
          }
        }
        limit: { context: number; output: number }
      }
    }
  }>
}

export interface ChatParamsModel {
  id: string
  cost: {
    input: number
    output: number
    cache: { read: number; write: number }
  }
  limit: { context: number; output: number }
}

export interface ChatParamsProviderCtx {
  id?: string
  info?: { id: string }
}

function resolveHardcodedContextLimit(modelID: string): number {
  const lower = modelID.toLowerCase()

  if (lower.includes("gemini-2.5-pro") || lower.includes("gemini-3-pro")) {
    return 2_097_152
  }
  if (lower.includes("gemini")) {
    return 1_048_576
  }
  if (lower.includes("gpt-5")) {
    return 272_000
  }
  if (lower.includes("claude") || lower.includes("opus") || lower.includes("sonnet") || lower.includes("haiku")) {
    return 200_000
  }

  return 200_000
}

export function createModelRegistry(): ModelRegistry {
  const storage = new Map<string, ModelRegistryEntry>()

  function makeKey(providerID: string, modelID: string): string {
    return `${providerID}/${modelID}`
  }

  function get(providerID: string, modelID: string): ModelRegistryEntry | null {
    const key = makeKey(providerID, modelID)
    return storage.get(key) ?? null
  }

  function set(entry: ModelRegistryEntry): void {
    const key = makeKey(entry.providerID, entry.modelID)
    storage.set(key, entry)
  }

  function resolveContextLimit(modelID: string, providerID?: string): number {
    if (providerID !== undefined) {
      const entry = get(providerID, modelID)
      if (entry !== null) {
        return entry.limit.context
      }
    }

    for (const entry of storage.values()) {
      if (entry.modelID === modelID) {
        return entry.limit.context
      }
    }

    const hardcoded = resolveHardcodedContextLimit(modelID)
    return hardcoded
  }

  function populateFromProviderList(response: ProviderListResponse): void {
    for (const provider of response.all) {
      for (const [modelID, modelData] of Object.entries(provider.models)) {
        let cost: ModelCostRates | null = null

        if (modelData.cost !== undefined) {
          const rates = [
            modelData.cost.input,
            modelData.cost.output,
            modelData.cost.cache_read,
            modelData.cost.cache_write
          ]
          const anyRateOverOne = rates.some((r) => r !== undefined && r > 1)

          const normalize = (r: number | undefined): number => {
            if (r === undefined || !Number.isFinite(r)) {
              return 0
            }
            let result: number
            if (anyRateOverOne) {
              result = r / 1_000_000
            } else if (r >= 0.001 && r < 0.1) {
              result = r / 1_000
            } else {
              result = r
            }
            return Number(result.toFixed(12))
          }

          const over200k = modelData.cost.context_over_200k
          cost = {
            input: normalize(modelData.cost.input),
            output: normalize(modelData.cost.output),
            cacheRead: normalize(modelData.cost.cache_read),
            cacheWrite: normalize(modelData.cost.cache_write)
          }

          if (over200k !== undefined) {
            cost.over200k = {
              input: normalize(over200k.input),
              output: normalize(over200k.output),
              cacheRead: normalize(over200k.cache_read),
              cacheWrite: normalize(over200k.cache_write)
            }
          }
        }

        set({
          providerID: provider.id,
          modelID,
          cost,
          limit: modelData.limit
        })
      }
    }
  }

  function updateFromChatParams(model: ChatParamsModel, providerCtx: ChatParamsProviderCtx): void {
    const rates = [model.cost.input, model.cost.output, model.cost.cache.read, model.cost.cache.write]
    const anyRateOverOne = rates.some((r) => r > 1)

    const normalize = (rate: number): number => {
      const result = anyRateOverOne ? rate / 1_000_000 : rate / 1_000
      return Number(result.toFixed(12))
    }

    const cost: ModelCostRates = {
      input: normalize(model.cost.input),
      output: normalize(model.cost.output),
      cacheRead: normalize(model.cost.cache.read),
      cacheWrite: normalize(model.cost.cache.write)
    }

    const providerID = providerCtx.id ?? providerCtx.info?.id ?? ""
    if (!providerID) return

    set({
      providerID,
      modelID: model.id,
      cost,
      limit: model.limit
    })
  }

  function snapshot(): ModelRegistryEntry[] {
    return Array.from(storage.values())
  }

  function restore(entries: ModelRegistryEntry[]): void {
    for (const entry of entries) {
      set(entry)
    }
  }

  return {
    get,
    set,
    resolveContextLimit,
    populateFromProviderList,
    updateFromChatParams,
    snapshot,
    restore
  }
}
