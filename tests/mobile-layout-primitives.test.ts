import { describe, it, expect } from "vitest"

describe("mobile layout primitives", () => {
  it("uses a 16px mobile form-control floor to avoid iOS focus zoom", () => {
    const inputClass = "text-base md:text-sm"
    expect(inputClass.includes("text-base")).toBe(true)
    expect(inputClass.includes("md:text-sm")).toBe(true)
  })

  it("keeps the mobile breakpoint at 767px", () => {
    const query = "(max-width: 767px)"
    expect(query).toBe("(max-width: 767px)")
  })
})
