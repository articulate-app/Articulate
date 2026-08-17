import { describe, expect, it } from "vitest"
import {
  calculateKeywordDensity,
  countKeywordOccurrences,
  normalizeKeywordMatchText,
} from "../features/tasks/utils/keyword-density"

describe("keyword density matching", () => {
  it("treats hyphens and spaces as equivalent", () => {
    const text = "We use water-resistant materials for outdoor gear."
    expect(countKeywordOccurrences(text, "water resistant materials")).toBe(1)
    expect(countKeywordOccurrences(text, "water-resistant materials")).toBe(1)
  })

  it("normalizes en-dashes and multiple separators", () => {
    expect(normalizeKeywordMatchText("water–resistant_materials")).toBe(
      "water resistant materials",
    )
    expect(
      countKeywordOccurrences(
        "Choose water–resistant materials today.",
        "water resistant materials",
      ),
    ).toBe(1)
  })

  it("counts density against normalized word total", () => {
    const text = "water-resistant materials and more water-resistant materials"
    // Hyphen splits into words: 8 words after normalize; 2 phrase hits → 25%
    expect(calculateKeywordDensity(text, "water resistant materials")).toBeCloseTo(
      (2 / 8) * 100,
      5,
    )
  })

  it("returns 0 when phrase is absent", () => {
    expect(countKeywordOccurrences("cotton soft fabric", "water resistant materials")).toBe(0)
  })

  it("counts keywords next to punctuation", () => {
    const text =
      "A coloproctologia é importante. Em coloproctologia, os médicos atuam. Sobre coloproctologia."
    expect(countKeywordOccurrences(text, "coloproctologia")).toBe(3)
  })

  it("treats diacritic variants as the same keyword", () => {
    expect(countKeywordOccurrences("A glicémia capilar ajuda a acompanhar a diabetes.", "glicemia capilar")).toBe(1)
  })

  it("does not count partial word matches", () => {
    expect(countKeywordOccurrences("marketing and remarketing tips", "marketing")).toBe(1)
  })
})
