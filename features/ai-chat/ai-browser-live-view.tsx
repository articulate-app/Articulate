"use client"

import { useEffect, useRef, useState } from "react"
import {
  CLOUD_LIVE_VIEW_SCREEN_HEIGHT,
  CLOUD_LIVE_VIEW_SCREEN_WIDTH,
  LIVE_VIEW_STREAM_HEIGHT,
  LIVE_VIEW_STREAM_WIDTH,
  liveViewCoverLayout,
  withLiveViewEmbedParams,
} from "../../app/lib/publishing/browser-viewport"
import { alignBrowserViewport } from "../../app/lib/services/agentic-publishing"
import { cn } from "../../app/lib/utils"

const alignedCloudBrowsers = new Set<string>()

export function AiBrowserLiveView(props: {
  liveViewUrl: string
  browserId?: string | null
  title?: string | null
  interactive?: boolean
  className?: string
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [host, setHost] = useState({ width: 0, height: 0 })
  const src = withLiveViewEmbedParams(props.liveViewUrl)

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const publish = () => {
      const rect = el.getBoundingClientRect()
      setHost((prev) => {
        const width = Math.round(rect.width)
        const height = Math.round(rect.height)
        if (prev.width === width && prev.height === height) return prev
        return { width, height }
      })
    }
    publish()
    const observer = new ResizeObserver(() => publish())
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const browserId = String(props.browserId ?? "").trim()
    if (!browserId || alignedCloudBrowsers.has(browserId)) return
    alignedCloudBrowsers.add(browserId)
    void alignBrowserViewport({
      browserId,
      browserViewport: {
        width: CLOUD_LIVE_VIEW_SCREEN_WIDTH,
        height: CLOUD_LIVE_VIEW_SCREEN_HEIGHT,
      },
    }).catch(() => {
      alignedCloudBrowsers.delete(browserId)
    })
  }, [props.browserId])

  const layout =
    host.width > 0 && host.height > 0
      ? liveViewCoverLayout({
          hostWidth: host.width,
          hostHeight: host.height,
          remoteWidth: LIVE_VIEW_STREAM_WIDTH,
          remoteHeight: LIVE_VIEW_STREAM_HEIGHT,
          verticalAlign: "top",
        })
      : null

  return (
    <div
      ref={hostRef}
      className={cn("relative h-full w-full overflow-hidden bg-gray-100", props.className)}
    >
      {src ? (
        <iframe
          title={props.title ? `Browser ${props.title}` : "Browser live view"}
          src={src}
          className={cn(
            "absolute block border-0 bg-white",
            props.interactive ? "pointer-events-auto" : "pointer-events-none",
          )}
          style={{
            width: layout?.width ?? "100%",
            height: layout?.height ?? "100%",
            left: layout?.left ?? 0,
            top: layout?.top ?? 0,
          }}
          allow="autoplay; clipboard-read; clipboard-write; fullscreen"
        />
      ) : null}
    </div>
  )
}
