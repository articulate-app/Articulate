import { describe, expect, it } from "vitest"
import { notifyUsersFromWatcherRows } from "../app/hooks/use-artifact-comment-threads"

describe("notifyUsersFromWatcherRows", () => {
  it("maps list_task_watchers rows to notify users", () => {
    const users = notifyUsersFromWatcherRows([
      { watcher_user_id: 12, full_name: "Ana", photo: null },
      { user_id: 12, full_name: "Ana duplicate" },
      { users: { id: 8, full_name: "Ivo", email: "ivo@example.com", photo: "p.jpg" } },
    ])
    expect(users).toEqual([
      { id: 12, full_name: "Ana", email: null, photo: null },
      { id: 8, full_name: "Ivo", email: "ivo@example.com", photo: "p.jpg" },
    ])
  })
})
