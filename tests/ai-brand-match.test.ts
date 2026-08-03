import { describe, expect, it } from "vitest"
import {
  brandNamesLooselyMatch,
  domainsLooselyMatch,
  findBrandInRankedEntities,
  registrableLabel,
} from "../app/lib/ai-brand-match"

describe("ai-brand-match", () => {
  it("matches same brand across different TLDs", () => {
    expect(domainsLooselyMatch("bancocarregosa.com", "https://www.bancocarregosa.pt")).toBe(true)
    expect(domainsLooselyMatch("bancocarregosa.com", "https://www.carregosa.pt")).toBe(true)
    expect(registrableLabel("www.bancocarregosa.com")).toBe("bancocarregosa")
  })

  it("matches brand names with shared tokens", () => {
    expect(brandNamesLooselyMatch("Banco Carregosa Conteúdos", "Banco Carregosa")).toBe(true)
    expect(brandNamesLooselyMatch("bancocarregosa", "Banco Carregosa")).toBe(true)
  })

  it("finds brand in ranked entities via domain or name", () => {
    const entities = [
      {
        position: 1,
        name: "Other Bank",
        url: "https://other.pt",
        snippet: null,
      },
      {
        position: 7,
        name: "Banco Carregosa",
        url: "https://www.carregosa.pt",
        snippet: "Private bank",
      },
    ]
    const match = findBrandInRankedEntities(entities, {
      projectDomain: "bancocarregosa.com",
      projectName: "Banco Carregosa Conteúdos",
    })
    expect(match?.position).toBe(7)
    expect(match?.name).toBe("Banco Carregosa")
  })
})
