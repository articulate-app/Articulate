import { describe, expect, it } from "vitest"
import {
  buildCenterPaneTabSelectionSearchParams,
  getActiveCenterSelection,
  KEYWORD_RESEARCH_CENTER_VIEW,
  KEYWORD_RESEARCH_QUERY_PARAM,
} from "../app/lib/center-pane-selection-url"

describe("keyword research center selection", () => {
  it("builds a centerView URL and clears entity selection params", () => {
    const next = buildCenterPaneTabSelectionSearchParams({
      currentSearchParams: new URLSearchParams(
        "centerTaskId=12&centerTab=overview&itemKind=suggestion&centerSuggestionId=9",
      ),
      kind: "keyword-research",
      id: "default",
    })
    expect(next.get("centerView")).toBe(KEYWORD_RESEARCH_CENTER_VIEW)
    expect(next.get("layout")).toBe("right")
    expect(next.get("centerTaskId")).toBeNull()
    expect(next.get("centerSuggestionId")).toBeNull()
    expect(next.get("itemKind")).toBeNull()
    expect(next.get(KEYWORD_RESEARCH_QUERY_PARAM)).toBeNull()
  })

  it("seeds krQuery when opening from search", () => {
    const next = buildCenterPaneTabSelectionSearchParams({
      currentSearchParams: new URLSearchParams("centerTaskId=12"),
      kind: "keyword-research",
      id: "default",
      keywordQuery: " seo tips ",
    })
    expect(next.get("centerView")).toBe(KEYWORD_RESEARCH_CENTER_VIEW)
    expect(next.get(KEYWORD_RESEARCH_QUERY_PARAM)).toBe("seo tips")
  })

  it("resolves centerView as the active selection", () => {
    const selection = getActiveCenterSelection(
      new URLSearchParams(`centerView=${KEYWORD_RESEARCH_CENTER_VIEW}`),
    )
    expect(selection).toEqual({ type: "keyword-research" })
  })
})
