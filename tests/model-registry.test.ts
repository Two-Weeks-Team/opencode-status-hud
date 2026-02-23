import { describe, expect, it } from "vitest"

import {
  createModelRegistry,
  type ChatParamsModel,
  type ChatParamsProviderCtx,
  type ProviderListResponse
} from "../src/model-registry.js"

describe("Model Registry", () => {
  describe("empty registry", () => {
    it("returns null for unknown provider/model", () => {
      const registry = createModelRegistry()
      const result = registry.get("unknown", "unknown")
      expect(result).toBeNull()
    })
  })

  describe("resolveContextLimit", () => {
    it("falls back to 200K for unknown model", () => {
      const registry = createModelRegistry()
      const limit = registry.resolveContextLimit("claude-sonnet-4-20250514")
      expect(limit).toBe(200_000)
    })

    it("prefers registry value over hardcoded fallback", () => {
      const registry = createModelRegistry()
      registry.set({
        providerID: "anthropic",
        modelID: "claude-sonnet-4-20250514",
        cost: null,
        limit: { context: 500_000, output: 8192 }
      })
      const limit = registry.resolveContextLimit("claude-sonnet-4-20250514")
      expect(limit).toBe(500_000)
    })

    it("returns hardcoded limit for gemini-2.5-pro", () => {
      const registry = createModelRegistry()
      const limit = registry.resolveContextLimit("gemini-2.5-pro-exp")
      expect(limit).toBe(2_097_152)
    })

    it("returns hardcoded limit for gemini-3-pro", () => {
      const registry = createModelRegistry()
      const limit = registry.resolveContextLimit("gemini-3-pro")
      expect(limit).toBe(2_097_152)
    })

    it("returns hardcoded limit for gemini", () => {
      const registry = createModelRegistry()
      const limit = registry.resolveContextLimit("gemini-1.5-flash")
      expect(limit).toBe(1_048_576)
    })

    it("returns hardcoded limit for gpt-5", () => {
      const registry = createModelRegistry()
      const limit = registry.resolveContextLimit("openai/gpt-5-codex")
      expect(limit).toBe(272_000)
    })

    it("returns hardcoded limit for claude models", () => {
      const registry = createModelRegistry()
      expect(registry.resolveContextLimit("claude-opus-4")).toBe(200_000)
      expect(registry.resolveContextLimit("claude-sonnet-4")).toBe(200_000)
      expect(registry.resolveContextLimit("claude-haiku-4")).toBe(200_000)
    })

    it("respects providerID when resolving", () => {
      const registry = createModelRegistry()
      registry.set({
        providerID: "custom",
        modelID: "test-model",
        cost: null,
        limit: { context: 300_000, output: 4096 }
      })
      const limit = registry.resolveContextLimit("test-model", "custom")
      expect(limit).toBe(300_000)
    })
  })

  describe("set + get roundtrip", () => {
    it("stores and retrieves entry", () => {
      const registry = createModelRegistry()
      const entry = {
        providerID: "openai",
        modelID: "gpt-4",
        cost: {
          input: 0.00003,
          output: 0.00006,
          cacheRead: 0.000015,
          cacheWrite: 0.00003
        },
        limit: { context: 128_000, output: 4096 }
      }
      registry.set(entry)
      const retrieved = registry.get("openai", "gpt-4")
      expect(retrieved).toEqual(entry)
    })

    it("overwrites existing entry", () => {
      const registry = createModelRegistry()
      registry.set({
        providerID: "openai",
        modelID: "gpt-4",
        cost: { input: 0.01, output: 0.02, cacheRead: 0.005, cacheWrite: 0.01 },
        limit: { context: 8000, output: 4096 }
      })
      registry.set({
        providerID: "openai",
        modelID: "gpt-4",
        cost: { input: 0.02, output: 0.04, cacheRead: 0.01, cacheWrite: 0.02 },
        limit: { context: 128_000, output: 4096 }
      })
      const retrieved = registry.get("openai", "gpt-4")
      expect(retrieved?.limit.context).toBe(128_000)
    })
  })

  describe("populateFromProviderList", () => {
    it("extracts cost and limit from provider list response", () => {
      const registry = createModelRegistry()
      const response: ProviderListResponse = {
        all: [
          {
            id: "openai",
            models: {
              "gpt-4": {
                cost: { input: 0.03, output: 0.06, cache_read: 0.015, cache_write: 0.03 },
                limit: { context: 128_000, output: 4096 }
              },
              "gpt-3.5-turbo": {
                cost: { input: 0.0015, output: 0.002 },
                limit: { context: 16_384, output: 4096 }
              }
            }
          },
          {
            id: "anthropic",
            models: {
              "claude-opus": {
                cost: { input: 0.015, output: 0.075 },
                limit: { context: 200_000, output: 4096 }
              }
            }
          }
        ]
      }
      registry.populateFromProviderList(response)

      const gpt4 = registry.get("openai", "gpt-4")
      expect(gpt4).not.toBeNull()
      expect(gpt4?.cost).toEqual({
        input: 0.00003,
        output: 0.00006,
        cacheRead: 0.000015,
        cacheWrite: 0.00003
      })
      expect(gpt4?.limit).toEqual({ context: 128_000, output: 4096 })

      const gpt35 = registry.get("openai", "gpt-3.5-turbo")
      expect(gpt35?.cost).toEqual({
        input: 0.0000015,
        output: 0.000002,
        cacheRead: 0,
        cacheWrite: 0
      })

      const claude = registry.get("anthropic", "claude-opus")
      expect(claude?.cost).toEqual({
        input: 0.000015,
        output: 0.000075,
        cacheRead: 0,
        cacheWrite: 0
      })
    })

    it("handles model with no cost (cost becomes null)", () => {
      const registry = createModelRegistry()
      const response: ProviderListResponse = {
        all: [
          {
            id: "test-provider",
            models: {
              "free-model": {
                limit: { context: 100_000, output: 4096 }
              }
            }
          }
        ]
      }
      registry.populateFromProviderList(response)

      const entry = registry.get("test-provider", "free-model")
      expect(entry).not.toBeNull()
      expect(entry?.cost).toBeNull()
      expect(entry?.limit).toEqual({ context: 100_000, output: 4096 })
    })

    it("handles context_over_200k pricing", () => {
      const registry = createModelRegistry()
      const response: ProviderListResponse = {
        all: [
          {
            id: "anthropic",
            models: {
              "claude-opus": {
                cost: {
                  input: 15,
                  output: 75,
                  cache_read: 3.75,
                  cache_write: 15,
                  context_over_200k: {
                    input: 30,
                    output: 150,
                    cache_read: 7.5,
                    cache_write: 30
                  }
                },
                limit: { context: 200_000, output: 4096 }
              }
            }
          }
        ]
      }
      registry.populateFromProviderList(response)

      const entry = registry.get("anthropic", "claude-opus")
      expect(entry?.cost).toEqual({
        input: 0.000015,
        output: 0.000075,
        cacheRead: 0.00000375,
        cacheWrite: 0.000015,
        over200k: {
          input: 0.00003,
          output: 0.00015,
          cacheRead: 0.0000075,
          cacheWrite: 0.00003
        }
      })
    })
  })

  describe("updateFromChatParams", () => {
    it("upserts entry from chat params shape", () => {
      const registry = createModelRegistry()
      const model: ChatParamsModel = {
        id: "gpt-4-turbo",
        cost: {
          input: 0.01,
          output: 0.03,
          cache: { read: 0.005, write: 0.01 }
        },
        limit: { context: 128_000, output: 4096 }
      }
      const providerCtx: ChatParamsProviderCtx = {
        info: { id: "openai" }
      }
      registry.updateFromChatParams(model, providerCtx)

      const entry = registry.get("openai", "gpt-4-turbo")
      expect(entry).not.toBeNull()
      expect(entry?.providerID).toBe("openai")
      expect(entry?.modelID).toBe("gpt-4-turbo")
      expect(entry?.limit).toEqual({ context: 128_000, output: 4096 })
    })

    it("maps SDK cost shape correctly", () => {
      const registry = createModelRegistry()
      const model: ChatParamsModel = {
        id: "claude-sonnet",
        cost: {
          input: 3,
          output: 15,
          cache: { read: 0.375, write: 1.5 }
        },
        limit: { context: 200_000, output: 4096 }
      }
      const providerCtx: ChatParamsProviderCtx = {
        info: { id: "anthropic" }
      }
      registry.updateFromChatParams(model, providerCtx)

      const entry = registry.get("anthropic", "claude-sonnet")
      expect(entry?.cost).toEqual({
        input: 0.000003,
        output: 0.000015,
        cacheRead: 0.000000375,
        cacheWrite: 0.0000015
      })
    })

    it("overwrites existing entry with new values", () => {
      const registry = createModelRegistry()
      registry.set({
        providerID: "openai",
        modelID: "gpt-4",
        cost: { input: 0.01, output: 0.02, cacheRead: 0, cacheWrite: 0 },
        limit: { context: 8000, output: 4096 }
      })

      const model: ChatParamsModel = {
        id: "gpt-4",
        cost: {
          input: 0.03,
          output: 0.06,
          cache: { read: 0.015, write: 0.03 }
        },
        limit: { context: 128_000, output: 4096 }
      }
      const providerCtx: ChatParamsProviderCtx = {
        info: { id: "openai" }
      }
      registry.updateFromChatParams(model, providerCtx)

      const entry = registry.get("openai", "gpt-4")
      expect(entry?.limit.context).toBe(128_000)
      expect(entry?.cost?.input).toBe(0.00003)
    })
  })

  describe("snapshot + restore", () => {
    it("roundtrips entries correctly", () => {
      const registry = createModelRegistry()
      registry.set({
        providerID: "openai",
        modelID: "gpt-4",
        cost: { input: 0.00003, output: 0.00006, cacheRead: 0.000015, cacheWrite: 0.00003 },
        limit: { context: 128_000, output: 4096 }
      })
      registry.set({
        providerID: "anthropic",
        modelID: "claude-opus",
        cost: null,
        limit: { context: 200_000, output: 4096 }
      })

      const snapshot = registry.snapshot()
      expect(snapshot).toHaveLength(2)

      const newRegistry = createModelRegistry()
      newRegistry.restore(snapshot)

      const gpt4 = newRegistry.get("openai", "gpt-4")
      expect(gpt4?.cost).toEqual({
        input: 0.00003,
        output: 0.00006,
        cacheRead: 0.000015,
        cacheWrite: 0.00003
      })

      const claude = newRegistry.get("anthropic", "claude-opus")
      expect(claude?.cost).toBeNull()
    })

    it("restore overwrites existing entries", () => {
      const registry = createModelRegistry()
      registry.set({
        providerID: "openai",
        modelID: "gpt-4",
        cost: { input: 0.01, output: 0.02, cacheRead: 0, cacheWrite: 0 },
        limit: { context: 8000, output: 4096 }
      })

      registry.restore([
        {
          providerID: "openai",
          modelID: "gpt-4",
          cost: { input: 0.00003, output: 0.00006, cacheRead: 0.000015, cacheWrite: 0.00003 },
          limit: { context: 128_000, output: 4096 }
        }
      ])

      const entry = registry.get("openai", "gpt-4")
      expect(entry?.limit.context).toBe(128_000)
    })
  })

  describe("cost normalization", () => {
    it("normalizes per-million rates to per-token", () => {
      const registry = createModelRegistry()
      const response: ProviderListResponse = {
        all: [
          {
            id: "openai",
            models: {
              "gpt-4": {
                cost: { input: 30, output: 60 },
                limit: { context: 128_000, output: 4096 }
              }
            }
          }
        ]
      }
      registry.populateFromProviderList(response)

      const entry = registry.get("openai", "gpt-4")
      expect(entry?.cost?.input).toBe(0.00003)
      expect(entry?.cost?.output).toBe(0.00006)
    })

    it("does not normalize already-per-token rates", () => {
      const registry = createModelRegistry()
      const response: ProviderListResponse = {
        all: [
          {
            id: "test",
            models: {
              "cheap-model": {
                cost: { input: 0.000001, output: 0.000002 },
                limit: { context: 100_000, output: 4096 }
              }
            }
          }
        ]
      }
      registry.populateFromProviderList(response)

      const entry = registry.get("test", "cheap-model")
      expect(entry?.cost?.input).toBe(0.000001)
      expect(entry?.cost?.output).toBe(0.000002)
    })

    it("normalizes rates > 1 but keeps rates <= 1 unchanged", () => {
      const registry = createModelRegistry()
      const response: ProviderListResponse = {
        all: [
          {
            id: "provider",
            models: {
              "model-a": {
                cost: { input: 1.5, output: 2.5 },
                limit: { context: 100_000, output: 4096 }
              },
              "model-b": {
                cost: { input: 0.5, output: 0.75 },
                limit: { context: 100_000, output: 4096 }
              }
            }
          }
        ]
      }
      registry.populateFromProviderList(response)

      const modelA = registry.get("provider", "model-a")
      expect(modelA?.cost?.input).toBe(0.0000015)
      expect(modelA?.cost?.output).toBe(0.0000025)

      const modelB = registry.get("provider", "model-b")
      expect(modelB?.cost?.input).toBe(0.5)
      expect(modelB?.cost?.output).toBe(0.75)
    })
  })
})
