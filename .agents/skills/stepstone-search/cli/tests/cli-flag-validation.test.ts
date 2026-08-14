import { describe, expect, test } from "bun:test"
import { runCLI } from "./helpers.js"

describe("CLI contract", () => {
  test("no arguments prints help and exits 1", async () => {
    const r = await runCLI([])
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain("stepstone-cli")
  })

  test("an unknown command exits 1 with a JSON error on stderr", async () => {
    const r = await runCLI(["frobnicate"])
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toBe("")
    expect(JSON.parse(r.stderr).code).toBe("BAD_CMD")
  })

  test("a non-numeric --limit exits 1 with a JSON error on stderr", async () => {
    const r = await runCLI(["search", "-q", "marketing", "--limit", "veel"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("BAD_ARG")
  })

  test("--page is refused, with robots.txt as the stated reason", async () => {
    const r = await runCLI(["search", "-q", "marketing", "--page", "2"])
    expect(r.exitCode).toBe(1)
    const err = JSON.parse(r.stderr)
    expect(err.code).toBe("PAGINATION_UNSUPPORTED")
    expect(err.error).toContain("robots.txt")
  })

  test("detail without an id exits 1", async () => {
    const r = await runCLI(["detail"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("NO_ID")
  })

  test("detail with a bare id explains that the full URL is required", async () => {
    const r = await runCLI(["detail", "2229955"])
    expect(r.exitCode).toBe(1)
    const err = JSON.parse(r.stderr)
    expect(err.code).toBe("NEEDS_FULL_URL")
  })

  test("detail with junk input exits 1 before any network call", async () => {
    const r = await runCLI(["detail", "definitely-not-a-url"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("BAD_ID")
  })
})
