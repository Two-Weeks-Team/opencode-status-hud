import { describe, expect, it } from "vitest"
import { resolveOpenAIAuthToken, type OpenAIAuthResolverOptions } from "../src/auth-resolver-openai.js"

describe("resolveOpenAIAuthToken", () => {
  const mockReadFileNotFound = async (_path: string, _encoding: string) => {
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
  }

  it("returns null when auth.json not found (ENOENT)", async () => {
    const result = await resolveOpenAIAuthToken({
      readFileFn: mockReadFileNotFound,
      env: {}
    })
    expect(result).toBeNull()
  })

  it("returns null when auth.json is invalid JSON", async () => {
    const mockReadFileInvalid = async (_path: string, _encoding: string) => {
      return "not valid json {"
    }

    const result = await resolveOpenAIAuthToken({
      readFileFn: mockReadFileInvalid,
      env: {}
    })
    expect(result).toBeNull()
  })

  it("returns null when auth.json has no tokens or API key", async () => {
    const mockReadFileEmpty = async (_path: string, _encoding: string) => {
      return JSON.stringify({ other: "value" })
    }

    const result = await resolveOpenAIAuthToken({
      readFileFn: mockReadFileEmpty,
      env: {}
    })
    expect(result).toBeNull()
  })

  it("returns JWT token from tokens.access_token", async () => {
    const mockReadFileJwt = async (_path: string, _encoding: string) => {
      return JSON.stringify({
        tokens: {
          access_token: "ey-test-jwt-token",
          account_id: "test-account-id"
        }
      })
    }

    const result = await resolveOpenAIAuthToken({
      readFileFn: mockReadFileJwt,
      env: {}
    })

    expect(result).not.toBeNull()
    expect(result?.accessToken).toBe("ey-test-jwt-token")
    expect(result?.kind).toBe("jwt")
    expect(result?.source).toBe("codex-auth-file")
  })

  it("includes accountId from tokens.account_id", async () => {
    const mockReadFileJwt = async (_path: string, _encoding: string) => {
      return JSON.stringify({
        tokens: {
          access_token: "ey-test-jwt",
          account_id: "user-12345"
        }
      })
    }

    const result = await resolveOpenAIAuthToken({
      readFileFn: mockReadFileJwt,
      env: {}
    })

    expect(result?.accountId).toBe("user-12345")
  })

  it("includes refreshToken from tokens.refresh_token", async () => {
    const mockReadFileJwt = async (_path: string, _encoding: string) => {
      return JSON.stringify({
        tokens: {
          access_token: "ey-test-jwt",
          refresh_token: "refresh-token-xyz"
        }
      })
    }

    const result = await resolveOpenAIAuthToken({
      readFileFn: mockReadFileJwt,
      env: {}
    })

    expect(result?.refreshToken).toBe("refresh-token-xyz")
  })

  it("returns api-key from OPENAI_API_KEY field", async () => {
    const mockReadFileApiKey = async (_path: string, _encoding: string) => {
      return JSON.stringify({
        OPENAI_API_KEY: "sk-test-api-key"
      })
    }

    const result = await resolveOpenAIAuthToken({
      readFileFn: mockReadFileApiKey,
      env: {}
    })

    expect(result).not.toBeNull()
    expect(result?.accessToken).toBe("sk-test-api-key")
    expect(result?.kind).toBe("api-key")
    expect(result?.source).toBe("codex-auth-file")
  })

  it("prefers JWT tokens over API key when both present", async () => {
    const mockReadFileBoth = async (_path: string, _encoding: string) => {
      return JSON.stringify({
        OPENAI_API_KEY: "sk-api-key",
        tokens: {
          access_token: "ey-jwt-token"
        }
      })
    }

    const result = await resolveOpenAIAuthToken({
      readFileFn: mockReadFileBoth,
      env: {}
    })

    expect(result).not.toBeNull()
    expect(result?.accessToken).toBe("ey-jwt-token")
    expect(result?.kind).toBe("jwt")
  })

  it("respects CODEX_HOME env for auth.json path", async () => {
    let capturedPath = ""
    const mockReadFileCapture = async (path: string, _encoding: string) => {
      capturedPath = path
      return JSON.stringify({
        OPENAI_API_KEY: "sk-test-key"
      })
    }

    await resolveOpenAIAuthToken({
      readFileFn: mockReadFileCapture,
      env: { CODEX_HOME: "/custom/codex/path" }
    })

    expect(capturedPath).toContain("/custom/codex/path")
    expect(capturedPath).toContain("auth.json")
  })

  it("skips empty/whitespace tokens", async () => {
    const mockReadFileEmpty = async (_path: string, _encoding: string) => {
      return JSON.stringify({
        tokens: {
          access_token: "   "
        }
      })
    }

    const result = await resolveOpenAIAuthToken({
      readFileFn: mockReadFileEmpty,
      env: {}
    })

    expect(result).toBeNull()
  })

  it("handles tokens.access_token being null", async () => {
    const mockReadFileNull = async (_path: string, _encoding: string) => {
      return JSON.stringify({
        tokens: {
          access_token: null
        }
      })
    }

    const result = await resolveOpenAIAuthToken({
      readFileFn: mockReadFileNull,
      env: {}
    })

    expect(result).toBeNull()
  })

  it("handles OPENAI_API_KEY being null", async () => {
    const mockReadFileNull = async (_path: string, _encoding: string) => {
      return JSON.stringify({
        OPENAI_API_KEY: null
      })
    }

    const result = await resolveOpenAIAuthToken({
      readFileFn: mockReadFileNull,
      env: {}
    })

    expect(result).toBeNull()
  })

  it("handles malformed JSON (object but wrong shape)", async () => {
    const mockReadFileMalformed = async (_path: string, _encoding: string) => {
      return JSON.stringify({
        tokens: "not an object"
      })
    }

    const result = await resolveOpenAIAuthToken({
      readFileFn: mockReadFileMalformed,
      env: {}
    })

    expect(result).toBeNull()
  })

  it("handles tokens without access_token field", async () => {
    const mockReadFileNoAccess = async (_path: string, _encoding: string) => {
      return JSON.stringify({
        tokens: {
          account_id: "user-123"
        }
      })
    }

    const result = await resolveOpenAIAuthToken({
      readFileFn: mockReadFileNoAccess,
      env: {}
    })

    expect(result).toBeNull()
  })

  it("handles account_id that is null", async () => {
    const mockReadFileNoAccount = async (_path: string, _encoding: string) => {
      return JSON.stringify({
        tokens: {
          access_token: "ey-jwt-token",
          account_id: null
        }
      })
    }

    const result = await resolveOpenAIAuthToken({
      readFileFn: mockReadFileNoAccount,
      env: {}
    })

    expect(result).not.toBeNull()
    expect(result?.accountId).toBeUndefined()
  })

  it("returns null when auth.json is not an object", async () => {
    const mockReadFileArray = async (_path: string, _encoding: string) => {
      return JSON.stringify([1, 2, 3])
    }

    const result = await resolveOpenAIAuthToken({
      readFileFn: mockReadFileArray,
      env: {}
    })

    expect(result).toBeNull()
  })
})