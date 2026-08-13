import { describe, expect, it } from "vitest"
import { mapArtifactToPublishingArtifact } from "../supabase/functions/_shared/publishing/artifact-mapper"
import { parseAgentPublicationResult } from "../supabase/functions/_shared/publishing/agent-task"
import {
  canTransitionPublicationStatus,
  isPostPublishStatus,
  isTerminalPublicationStatus,
  resolvePostPublishOutcome,
  userFacingErrorMessage,
} from "../supabase/functions/_shared/publishing/state-machine"
import { deriveActivityFromEvents, appendActivity } from "../supabase/functions/_shared/publishing/activity"

describe("publication status transitions", () => {
  it("allows the happy-path flow through confirmation", () => {
    expect(canTransitionPublicationStatus("queued", "starting")).toBe(true)
    expect(canTransitionPublicationStatus("starting", "running")).toBe(true)
    expect(canTransitionPublicationStatus("running", "awaiting_publish_confirmation")).toBe(true)
    expect(canTransitionPublicationStatus("awaiting_publish_confirmation", "publishing")).toBe(true)
    expect(canTransitionPublicationStatus("publishing", "published")).toBe(true)
  })

  it("never leaves published/uncertain/cancelled via another transition", () => {
    for (const status of ["published", "uncertain", "cancelled", "failed"] as const) {
      expect(isTerminalPublicationStatus(status)).toBe(true)
      expect(canTransitionPublicationStatus(status, "running")).toBe(false)
      expect(canTransitionPublicationStatus(status, "publishing")).toBe(false)
    }
  })

  it("blocks automatic republish after a possible final action", () => {
    const uncertain = resolvePostPublishOutcome({
      currentStatus: "publishing",
      phase: "uncertain",
    })
    expect(uncertain.status).toBe("uncertain")
    expect(uncertain.allowRetryPublish).toBe(false)

    const verificationFailed = resolvePostPublishOutcome({
      currentStatus: "verifying",
      phase: "failed",
      errorCode: "verification_failed",
    })
    expect(verificationFailed.status).toBe("uncertain")
    expect(verificationFailed.allowRetryPublish).toBe(false)

    expect(isPostPublishStatus("published")).toBe(true)
    expect(isPostPublishStatus("uncertain")).toBe(true)
  })

  it("allows safe pre-publish failure retries", () => {
    const failed = resolvePostPublishOutcome({
      currentStatus: "running",
      phase: "failed",
      errorCode: "agent_failed",
    })
    expect(failed.status).toBe("failed")
    expect(failed.allowRetryPublish).toBe(true)
  })
})

describe("artifact mapper", () => {
  it("maps content blocks and media into PublishingArtifact", () => {
    const mapped = mapArtifactToPublishingArtifact({
      artifact: {
        id: "11111111-1111-4111-8111-111111111111",
        artifact_type: "document",
        title: "Launch notes",
        content_text: null,
        content_json: {
          blocks: [
            { type: "heading", level: 1, text: "Launch notes" },
            { type: "paragraph", html: "<p>Hello <strong>world</strong></p>" },
            {
              type: "image",
              attachment_id: "22222222-2222-4222-8222-222222222222",
              file_name: "hero.png",
              mime_type: "image/png",
            },
          ],
        },
        asset_data: {
          assets: [
            {
              attachment_id: "22222222-2222-4222-8222-222222222222",
              media_type: "image",
              role: "featured",
              file_name: "hero.png",
              mime_type: "image/png",
            },
          ],
        },
        metadata: {},
      },
      seo: { title: "SEO title", description: "SEO description" },
    })

    expect(mapped.title).toBe("Launch notes")
    expect(mapped.content).toContain("Hello")
    expect(mapped.seo?.title).toBe("SEO title")
    expect(mapped.media).toHaveLength(1)
    expect(mapped.media?.[0]?.type).toBe("image")
    expect(mapped.media?.[0]?.purpose).toBe("featured")
  })
})

describe("agent result parsing", () => {
  it("parses fenced JSON publication results", () => {
    const parsed = parseAgentPublicationResult(`Here is the result:
\`\`\`json
{"phase":"awaiting_publish_confirmation","message":"Form is ready","activity":["Adding title"]}
\`\`\``)
    expect(parsed?.phase).toBe("awaiting_publish_confirmation")
    expect(parsed?.activity?.[0]).toBe("Adding title")
  })

  it("rejects unknown phases", () => {
    expect(parseAgentPublicationResult('{"phase":"thinking"}')).toBeNull()
  })
})

describe("activity derivation", () => {
  it("keeps only operational labels and skips reasoning-like events", () => {
    const activity = deriveActivityFromEvents([
      {
        id: 1,
        runId: "run",
        ts: "2026-08-10T00:00:00.000Z",
        type: "model.reasoning",
        data: { text: "I am thinking about passwords" },
      },
      {
        id: 2,
        runId: "run",
        ts: "2026-08-10T00:00:01.000Z",
        type: "tool.navigate",
        data: { url: "https://cms.example.com" },
      },
      {
        id: 3,
        runId: "run",
        ts: "2026-08-10T00:00:02.000Z",
        type: "tool.upload",
        data: { name: "hero.png" },
      },
    ])

    expect(activity.map((item) => item.label)).toEqual([
      "Opening destination",
      "Uploading media",
    ])
    expect(appendActivity(activity, "Waiting for confirmation")).toHaveLength(3)
  })
})

describe("user-facing errors", () => {
  it("returns actionable copy for known codes", () => {
    expect(userFacingErrorMessage("authentication_required")).toMatch(/sign-in/i)
    expect(userFacingErrorMessage("uncertain")).toMatch(/inspect/i)
  })
})
