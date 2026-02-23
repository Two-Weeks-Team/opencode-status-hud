import { describe, expect, it } from "vitest"
import { resolveAuthToken, type AuthResolverOptions } from "../src/auth-resolver.js"

describe("resolveAuthToken", () => {
  const mockExecFile = async (_cmd: string, _args: string[]) => {
    return { stdout: "", stderr: "" }
  }

  const mockReadFile = async (_path: string | URL, _encoding: string) => {
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
  }

  it("returns null when no credentials anywhere", async () => {
    const result = await resolveAuthToken({
      execFileFn: mockExecFile,
      readFileFn: mockReadFile,
      env: {},
      platform: "linux",
    })
    expect(result).toBeNull()
  })

  it("returns oauth token from keychain on darwin with valid credential", async () => {
    const mockExecFileSuccess = async (_cmd: string, _args: string[]) => {
      return {
        stdout: JSON.stringify({ claudeAiOauth: { accessToken: "sk-ant-oat01-keychain-token" } }),
        stderr: "",
      }
    }

    const result = await resolveAuthToken({
      execFileFn: mockExecFileSuccess,
      readFileFn: mockReadFile,
      env: {},
      platform: "darwin",
    })

    expect(result).not.toBeNull()
    expect(result?.token).toBe("sk-ant-oat01-keychain-token")
    expect(result?.source).toBe("keychain")
    expect(result?.kind).toBe("oauth")
  })

  it("skips keychain on non-darwin platform", async () => {
    const mockExecFileNeverCalled = async (_cmd: string, _args: string[]) => {
      throw new Error("should not be called")
    }

    const mockReadFileWithToken = async (_path: string | URL, _encoding: string) => {
      return JSON.stringify({ claudeAiOauth: { accessToken: "credentials-file-token" } })
    }

    const result = await resolveAuthToken({
      execFileFn: mockExecFileNeverCalled,
      readFileFn: mockReadFileWithToken,
      env: {},
      platform: "linux",
    })

    expect(result).not.toBeNull()
    expect(result?.source).toBe("credentials-file")
  })

  it("skips to next when keychain command fails", async () => {
    const mockExecFileFails = async (_cmd: string, _args: string[]) => {
      throw new Error("security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain")
    }

    const mockReadFileWithToken = async (_path: string | URL, _encoding: string) => {
      return JSON.stringify({ claudeAiOauth: { accessToken: "credentials-file-token" } })
    }

    const result = await resolveAuthToken({
      execFileFn: mockExecFileFails,
      readFileFn: mockReadFileWithToken,
      env: {},
      platform: "darwin",
    })

    expect(result).not.toBeNull()
    expect(result?.source).toBe("credentials-file")
  })

  it("returns oauth token from credentials file", async () => {
    const mockReadFileWithToken = async (_path: string | URL, _encoding: string) => {
      return JSON.stringify({ claudeAiOauth: { accessToken: "sk-ant-oat01-credentials-file" } })
    }

    const result = await resolveAuthToken({
      execFileFn: mockExecFile,
      readFileFn: mockReadFileWithToken,
      env: {},
      platform: "linux",
    })

    expect(result).not.toBeNull()
    expect(result?.token).toBe("sk-ant-oat01-credentials-file")
    expect(result?.source).toBe("credentials-file")
    expect(result?.kind).toBe("oauth")
  })

  it("skips credentials file when not found", async () => {
    const mockReadFileNotFound = async (_path: string | URL, _encoding: string) => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
    }

    const result = await resolveAuthToken({
      execFileFn: mockExecFile,
      readFileFn: mockReadFileNotFound,
      env: { ANTHROPIC_OAUTH_TOKEN: "env-oauth-token" },
      platform: "linux",
    })

    expect(result).not.toBeNull()
    expect(result?.source).toBe("env-oauth")
  })

  it("returns oauth token from ANTHROPIC_OAUTH_TOKEN env", async () => {
    const result = await resolveAuthToken({
      execFileFn: mockExecFile,
      readFileFn: mockReadFile,
      env: { ANTHROPIC_OAUTH_TOKEN: "sk-ant-oat01-env-token" },
      platform: "linux",
    })

    expect(result).not.toBeNull()
    expect(result?.token).toBe("sk-ant-oat01-env-token")
    expect(result?.source).toBe("env-oauth")
    expect(result?.kind).toBe("oauth")
  })

  it("returns session token from CLAUDE_AI_SESSION_KEY env", async () => {
    const result = await resolveAuthToken({
      execFileFn: mockExecFile,
      readFileFn: mockReadFile,
      env: { CLAUDE_AI_SESSION_KEY: "sk-ant-sid01-session-key" },
      platform: "linux",
    })

    expect(result).not.toBeNull()
    expect(result?.token).toBe("sk-ant-sid01-session-key")
    expect(result?.source).toBe("env-session")
    expect(result?.kind).toBe("session")
  })

  it("returns session token from CLAUDE_WEB_SESSION_KEY env", async () => {
    const result = await resolveAuthToken({
      execFileFn: mockExecFile,
      readFileFn: mockReadFile,
      env: { CLAUDE_WEB_SESSION_KEY: "sk-ant-sid01-web-session-key" },
      platform: "linux",
    })

    expect(result).not.toBeNull()
    expect(result?.token).toBe("sk-ant-sid01-web-session-key")
    expect(result?.source).toBe("env-session")
    expect(result?.kind).toBe("session")
  })

  it("extracts session key from CLAUDE_WEB_COOKIE with valid sessionKey", async () => {
    const result = await resolveAuthToken({
      execFileFn: mockExecFile,
      readFileFn: mockReadFile,
      env: { CLAUDE_WEB_COOKIE: "sessionKey=sk-ant-sid01-cookie-session; other=value" },
      platform: "linux",
    })

    expect(result).not.toBeNull()
    expect(result?.token).toBe("sk-ant-sid01-cookie-session")
    expect(result?.source).toBe("env-cookie")
    expect(result?.kind).toBe("session")
  })

  it("skips CLAUDE_WEB_COOKIE when no sessionKey present", async () => {
    const mockReadFileWithSessionKey = async (_path: string | URL, _encoding: string) => {
      return "sk-ant-sid01-file-session"
    }

    const result = await resolveAuthToken({
      execFileFn: mockExecFile,
      readFileFn: mockReadFileWithSessionKey,
      env: { CLAUDE_WEB_COOKIE: "other=value; noSessionKey=here" },
      platform: "linux",
    })

    expect(result).not.toBeNull()
    expect(result?.source).toBe("session-key-file")
  })

  it("returns session token from ~/.claude-session-key file", async () => {
    const mockReadFileWithSessionKey = async (_path: string | URL, _encoding: string) => {
      return "sk-ant-sid01-file-session"
    }

    const result = await resolveAuthToken({
      execFileFn: mockExecFile,
      readFileFn: mockReadFileWithSessionKey,
      env: {},
      platform: "linux",
    })

    expect(result).not.toBeNull()
    expect(result?.token).toBe("sk-ant-sid01-file-session")
    expect(result?.source).toBe("session-key-file")
    expect(result?.kind).toBe("session")
  })

  it("skips empty token values", async () => {
    const result = await resolveAuthToken({
      execFileFn: mockExecFile,
      readFileFn: mockReadFile,
      env: {
        ANTHROPIC_OAUTH_TOKEN: "   ",
        CLAUDE_AI_SESSION_KEY: "",
        CLAUDE_WEB_SESSION_KEY: "  ",
        CLAUDE_WEB_COOKIE: "noSessionKey=here",
      },
      platform: "linux",
    })

    expect(result).toBeNull()
  })

  it("prioritizes keychain over all other sources on darwin", async () => {
    const mockExecFileSuccess = async (_cmd: string, _args: string[]) => {
      return {
        stdout: JSON.stringify({ claudeAiOauth: { accessToken: "keychain-token" } }),
        stderr: "",
      }
    }

    const mockReadFileNeverCalled = async (_path: string | URL, _encoding: string) => {
      throw new Error("should not be called")
    }

    const result = await resolveAuthToken({
      execFileFn: mockExecFileSuccess,
      readFileFn: mockReadFileNeverCalled,
      env: { ANTHROPIC_OAUTH_TOKEN: "env-token" },
      platform: "darwin",
    })

    expect(result).not.toBeNull()
    expect(result?.source).toBe("keychain")
  })

  it("prioritizes credentials file over env variables", async () => {
    const mockReadFileWithToken = async (_path: string | URL, _encoding: string) => {
      return JSON.stringify({ claudeAiOauth: { accessToken: "credentials-token" } })
    }

    const result = await resolveAuthToken({
      execFileFn: mockExecFile,
      readFileFn: mockReadFileWithToken,
      env: { ANTHROPIC_OAUTH_TOKEN: "env-token" },
      platform: "linux",
    })

    expect(result).not.toBeNull()
    expect(result?.source).toBe("credentials-file")
  })

  it("handles keychain JSON with missing claudeAiOauth", async () => {
    const mockExecFileBadJson = async (_cmd: string, _args: string[]) => {
      return {
        stdout: JSON.stringify({ otherKey: "value" }),
        stderr: "",
      }
    }

    const mockReadFileWithToken = async (_path: string | URL, _encoding: string) => {
      return JSON.stringify({ claudeAiOauth: { accessToken: "fallback-token" } })
    }

    const result = await resolveAuthToken({
      execFileFn: mockExecFileBadJson,
      readFileFn: mockReadFileWithToken,
      env: {},
      platform: "darwin",
    })

    expect(result).not.toBeNull()
    expect(result?.source).toBe("credentials-file")
  })

  it("handles keychain JSON with missing accessToken", async () => {
    const mockExecFileBadJson = async (_cmd: string, _args: string[]) => {
      return {
        stdout: JSON.stringify({ claudeAiOauth: { otherField: "value" } }),
        stderr: "",
      }
    }

    const mockReadFileWithToken = async (_path: string | URL, _encoding: string) => {
      return JSON.stringify({ claudeAiOauth: { accessToken: "fallback-token" } })
    }

    const result = await resolveAuthToken({
      execFileFn: mockExecFileBadJson,
      readFileFn: mockReadFileWithToken,
      env: {},
      platform: "darwin",
    })

    expect(result).not.toBeNull()
    expect(result?.source).toBe("credentials-file")
  })

  it("handles keychain with empty accessToken", async () => {
    const mockExecFileEmptyToken = async (_cmd: string, _args: string[]) => {
      return {
        stdout: JSON.stringify({ claudeAiOauth: { accessToken: "" } }),
        stderr: "",
      }
    }

    const mockReadFileWithToken = async (_path: string | URL, _encoding: string) => {
      return JSON.stringify({ claudeAiOauth: { accessToken: "fallback-token" } })
    }

    const result = await resolveAuthToken({
      execFileFn: mockExecFileEmptyToken,
      readFileFn: mockReadFileWithToken,
      env: {},
      platform: "darwin",
    })

    expect(result).not.toBeNull()
    expect(result?.source).toBe("credentials-file")
  })

  it("extracts session key at end of cookie without semicolon", async () => {
    const result = await resolveAuthToken({
      execFileFn: mockExecFile,
      readFileFn: mockReadFile,
      env: { CLAUDE_WEB_COOKIE: "other=value; sessionKey=sk-ant-sid01-end" },
      platform: "linux",
    })

    expect(result).not.toBeNull()
    expect(result?.token).toBe("sk-ant-sid01-end")
    expect(result?.source).toBe("env-cookie")
  })

  it("uses process.env when env option not provided", async () => {
    const originalEnv = process.env.ANTHROPIC_OAUTH_TOKEN
    process.env.ANTHROPIC_OAUTH_TOKEN = "process-env-token"

    try {
      const result = await resolveAuthToken({
        execFileFn: mockExecFile,
        readFileFn: mockReadFile,
        platform: "linux",
      })

      expect(result).not.toBeNull()
      expect(result?.token).toBe("process-env-token")
      expect(result?.source).toBe("env-oauth")
    } finally {
      if (originalEnv === undefined) {
        delete process.env.ANTHROPIC_OAUTH_TOKEN
      } else {
        process.env.ANTHROPIC_OAUTH_TOKEN = originalEnv
      }
    }
  })

  it("handles CLAUDE_AI_SESSION_KEY over CLAUDE_WEB_SESSION_KEY", async () => {
    const result = await resolveAuthToken({
      execFileFn: mockExecFile,
      readFileFn: mockReadFile,
      env: {
        CLAUDE_AI_SESSION_KEY: "ai-session-key",
        CLAUDE_WEB_SESSION_KEY: "web-session-key",
      },
      platform: "linux",
    })

    expect(result).not.toBeNull()
    expect(result?.token).toBe("ai-session-key")
  })
})
