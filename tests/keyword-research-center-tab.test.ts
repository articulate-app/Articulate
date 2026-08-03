import { describe, expect, it } from "vitest"
import {
  buildCenterPaneTabSelectionSearchParams,
  getActiveCenterSelection,
  KEYWORD_RESEARCH_CENTER_VIEW,
  KEYWORD_RESEARCH_QUERY_PARAM,
  PROMPT_RESEARCH_CENTER_VIEW,
  RESEARCH_CENTER_VIEW,
  RESEARCH_QUERY_PARAM,
  RESEARCH_TAB_PARAM,
} from "../app/lib/center-pane-selection-url"

describe("research center selection", () => {
  it("builds a unified research centerView URL and clears entity selection params", () => {
    const next = buildCenterPaneTabSelectionSearchParams({
      currentSearchParams: new URLSearchParams(
        "centerTaskId=12&centerTab=overview&itemKind=suggestion&centerSuggestionId=9",
      ),
      kind: "research",
      id: "default",
    })
    expect(next.get("centerView")).toBe(RESEARCH_CENTER_VIEW)
    expect(next.get(RESEARCH_TAB_PARAM)).toBe("keywords")
    expect(next.get("layout")).toBe("right")
    expect(next.get("centerTaskId")).toBeNull()
    expect(next.get("centerSuggestionId")).toBeNull()
    expect(next.get("itemKind")).toBeNull()
    expect(next.get(RESEARCH_QUERY_PARAM)).toBeNull()
  })

  it("seeds rQuery when opening from search", () => {
    const next = buildCenterPaneTabSelectionSearchParams({
      currentSearchParams: new URLSearchParams("centerTaskId=12"),
      kind: "research",
      id: "default",
      researchQuery: " seo tips ",
      researchTab: "keywords",
    })
    expect(next.get("centerView")).toBe(RESEARCH_CENTER_VIEW)
    expect(next.get(RESEARCH_QUERY_PARAM)).toBe("seo tips")
    expect(next.get(RESEARCH_TAB_PARAM)).toBe("keywords")
  })

  it("maps legacy keyword-research kind to unified research URL", () => {
    const next = buildCenterPaneTabSelectionSearchParams({
      currentSearchParams: new URLSearchParams(),
      kind: "keyword-research",
      id: "default",
      keywordQuery: "banks",
    })
    expect(next.get("centerView")).toBe(RESEARCH_CENTER_VIEW)
    expect(next.get(RESEARCH_TAB_PARAM)).toBe("keywords")
    expect(next.get(RESEARCH_QUERY_PARAM)).toBe("banks")
    expect(next.get(KEYWORD_RESEARCH_QUERY_PARAM)).toBeNull()
  })

  it("maps legacy prompt-research kind to prompts tab", () => {
    const next = buildCenterPaneTabSelectionSearchParams({
      currentSearchParams: new URLSearchParams(),
      kind: "prompt-research",
      id: "default",
      promptQuery: "best banks",
    })
    expect(next.get("centerView")).toBe(RESEARCH_CENTER_VIEW)
    expect(next.get(RESEARCH_TAB_PARAM)).toBe("prompts")
    expect(next.get(RESEARCH_QUERY_PARAM)).toBe("best banks")
  })

  it("resolves research centerView as the active selection", () => {
    const selection = getActiveCenterSelection(
      new URLSearchParams(
        `centerView=${RESEARCH_CENTER_VIEW}&${RESEARCH_TAB_PARAM}=prompts`,
      ),
    )
    expect(selection).toEqual({ type: "research", tab: "prompts" })
  })

  it("resolves legacy keyword-research centerView as research keywords", () => {
    const selection = getActiveCenterSelection(
      new URLSearchParams(`centerView=${KEYWORD_RESEARCH_CENTER_VIEW}`),
    )
    expect(selection).toEqual({ type: "research", tab: "keywords" })
  })

  it("resolves legacy prompt-research centerView as research prompts", () => {
    const selection = getActiveCenterSelection(
      new URLSearchParams(`centerView=${PROMPT_RESEARCH_CENTER_VIEW}`),
    )
    expect(selection).toEqual({ type: "research", tab: "prompts" })
  })
})
