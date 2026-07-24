import { describe, it, expect, vi } from "vitest"
import type { InfiniteData, QueryClient } from "@tanstack/react-query"
import {
  bumpHomeSidebarRecentCache,
  homeSidebarRecentsQueryKey,
  type HomeSidebarRecentsFeedKey,
} from "../app/lib/home-sidebar-recents-cache"
import type { HomeRecentItem } from "../app/lib/services/home-sidebar-recents"

function makeClient(initial?: InfiniteData<HomeRecentItem[]>) {
  let data = initial
  return {
    setQueryData: vi.fn((_key: unknown, updater: unknown) => {
      data =
        typeof updater === "function"
          ? (updater as (old: InfiniteData<HomeRecentItem[]> | undefined) => InfiniteData<HomeRecentItem[]>)(data)
          : (updater as InfiniteData<HomeRecentItem[]>)
      return data
    }),
    getData: () => data,
  } as unknown as QueryClient & { getData: () => InfiniteData<HomeRecentItem[]> | undefined }
}

describe("bumpHomeSidebarRecentCache", () => {
  it("creates a first page when the cache is empty", () => {
    const client = makeClient(undefined)
    bumpHomeSidebarRecentCache(client, "tasks", { id: "13323", title: "My task" })
    const data = client.getData()
    expect(data?.pages[0]?.[0]?.id).toBe("13323")
    expect(data?.pages[0]?.[0]?.title).toBe("My task")
    expect(data?.pages[0]?.[0]?.recentAt).toBeTruthy()
  })

  it("moves an existing item to the front and updates recentAt", () => {
    const client = makeClient({
      pages: [
        [
          { id: "1", title: "Older", recentAt: "2026-01-01T00:00:00.000Z" },
          { id: "13323", title: "Stale title", recentAt: "2026-01-02T00:00:00.000Z" },
        ],
      ],
      pageParams: [0],
    })
    bumpHomeSidebarRecentCache(client, "tasks", { id: "13323", title: "Updated title" })
    const page = client.getData()?.pages[0] ?? []
    expect(page.map((row) => row.id)).toEqual(["13323", "1"])
    expect(page[0]?.title).toBe("Updated title")
  })

  it("uses the canonical query key", () => {
    const key = homeSidebarRecentsQueryKey("tasks" satisfies HomeSidebarRecentsFeedKey)
    expect(key).toEqual(["home-sidebar-recents", "tasks"])
  })
})
