import { afterEach, describe, expect, it, vi } from "vitest"
import { BrightDataClient } from "../supabase/functions/_shared/bright-data/client"
import { linkedinAdapter } from "../supabase/functions/_shared/bright-data/adapters/linkedin"

type FetchStub = (url: string) => { status?: number; body: unknown }

function stubFetch(handler: FetchStub) {
  const spy = vi.fn(async (input: unknown) => {
    const { status = 200, body } = handler(String(input))
    return new Response(JSON.stringify(body), { status })
  })
  vi.stubGlobal("fetch", spy)
  return spy
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("BrightDataClient.collect", () => {
  it("downloads records once the snapshot is ready", async () => {
    stubFetch((url) =>
      url.includes("/progress/")
        ? { body: { status: "ready" } }
        : { body: [{ url: "https://www.linkedin.com/posts/a" }] },
    )

    const result = await new BrightDataClient("key").collect("snap_1", {
      maxWaitMs: 0,
    })

    expect(result.status).toBe("ready")
    expect(result.status === "ready" && result.records).toHaveLength(1)
  })

  it("reports a slow snapshot as pending instead of failing the sync", async () => {
    const spy = stubFetch(() => ({ body: { status: "running" } }))

    const result = await new BrightDataClient("key").collect("snap_2", {
      maxWaitMs: 0,
    })

    expect(result).toEqual({ status: "pending", lastStatus: "running" })
    // One progress check, no snapshot download.
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("throws when Bright Data reports the snapshot failed", async () => {
    stubFetch(() => ({ body: { status: "failed" } }))

    await expect(
      new BrightDataClient("key").collect("snap_3", { maxWaitMs: 0 }),
    ).rejects.toThrow(/snap_3 failed/)
  })

  it("retries a dropped HTTP/2 connection instead of failing the snapshot", async () => {
    let calls = 0
    const spy = vi.fn(async () => {
      calls += 1
      if (calls === 1) {
        throw new TypeError(
          "error sending request for https://api.brightdata.com/datasets/v3/progress/snap_4: client error (SendRequest): http2 error: connection error received",
        )
      }
      return new Response(JSON.stringify({ status: "ready" }), { status: 200 })
    })
    vi.stubGlobal("fetch", spy)

    const result = await new BrightDataClient("key", { retryDelayMs: 0 }).collect(
      "snap_4",
      { maxWaitMs: 0 },
    )

    expect(result.status).toBe("ready")
    expect(calls).toBeGreaterThan(1)
  })

  it("keeps the snapshot pending when Bright Data stays unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError(
          "error sending request: client error (SendRequest): http2 error: connection error received",
        )
      }),
    )

    const result = await new BrightDataClient("key", { retryDelayMs: 0 }).collect(
      "snap_5",
      { maxWaitMs: 0 },
    )

    expect(result.status).toBe("pending")
    expect(result.status === "pending" && result.transientError).toMatch(/http2/)
  })
})

describe("network adapters split trigger from mapping", () => {
  const args = {
    profileUrl: "https://www.linkedin.com/company/acme",
    startDateIso: "2026-07-01T00:00:00.000Z",
    maxPosts: 2,
  }

  it("builds a company request without authored-posts filtering", () => {
    const request = linkedinAdapter.buildRequest(args)

    expect(request.options.discoverBy).toBe("company_url")
    expect(request.input).toEqual([
      { url: args.profileUrl, start_date: args.startDateIso },
    ])
    expect(request.metadata.discover_by).toBe("company_url")
  })

  it("builds a person request limited to authored posts", () => {
    const request = linkedinAdapter.buildRequest({
      ...args,
      profileUrl: "https://www.linkedin.com/in/example",
    })

    expect(request.options.discoverBy).toBe("profile_url")
    expect(request.input[0]).toMatchObject({ only_authored_posts: true })
  })

  it("treats LinkedIn showcase pages as organization feeds", () => {
    const request = linkedinAdapter.buildRequest({
      ...args,
      profileUrl: "https://www.linkedin.com/showcase/jcdecauxportugal/",
    })

    expect(request.options.discoverBy).toBe("company_url")
    expect(request.input[0]).not.toHaveProperty("only_authored_posts")
  })

  it("maps snapshot records and honours the post cap", () => {
    const posts = linkedinAdapter.mapRecords(
      [
        {
          url: "https://www.linkedin.com/posts/one",
          id: "1",
          post_text: "One",
          num_likes: 4,
        },
        { url: "https://www.linkedin.com/posts/two", id: "2" },
        { url: "https://www.linkedin.com/posts/three", id: "3" },
        { missing_url: true },
      ],
      args,
    )

    expect(posts).toHaveLength(2)
    expect(posts[0]).toMatchObject({
      network: "linkedin",
      externalPostId: "1",
      textContent: "One",
      reactionsCount: 4,
    })
  })
})
