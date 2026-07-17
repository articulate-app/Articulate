export function applyAiThreadOpenParams(current: URLSearchParams, threadId: string): URLSearchParams {
  const next = new URLSearchParams(current.toString())
  const nextLayout = new Set((next.get("layout") || "left,middle").split(",").filter(Boolean))
  nextLayout.add("right")
  next.set("layout", Array.from(nextLayout).join(","))
  next.set("aiThreadId", threadId)
  next.set("rightView", "ai")
  next.set("taskAiOpen", "true")
  return next
}

export function buildNewAiThreadParams(current: URLSearchParams): URLSearchParams {
  const next = applyAiThreadOpenParams(current, "")
  next.delete("aiThreadId")
  next.set("newAiThread", "true")
  return next
}
