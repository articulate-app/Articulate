import { describe, expect, it } from "vitest"
import { shouldPollPublicationSync } from "../app/lib/publishing/types"

describe("shouldPollPublicationSync", () => {
  it("polls only when an actionable provider run exists", () => {
    expect(
      shouldPollPublicationSync({
        status: "running",
        provider_run_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      }),
    ).toBe(true)
  })

  it("does not poll zombie starting runs without provider_run_id", () => {
    expect(
      shouldPollPublicationSync({
        status: "starting",
        provider_run_id: null,
      }),
    ).toBe(false)
  })

  it("does not poll while awaiting destination auth", () => {
    expect(
      shouldPollPublicationSync({
        status: "needs_user",
        provider_run_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        metadata: { awaiting_destination_auth: true },
      }),
    ).toBe(false)
  })

  it("does not poll terminal runs", () => {
    expect(
      shouldPollPublicationSync({
        status: "failed",
        provider_run_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      }),
    ).toBe(false)
  })
})
