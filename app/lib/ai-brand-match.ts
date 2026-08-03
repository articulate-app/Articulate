/**
 * Brand / domain matching for AI visibility results.
 * Project URLs often use a different TLD or brand hostname than the model emits
 * (e.g. bancocarregosa.com vs bancocarregosa.pt / carregosa.pt).
 */

export function normalizeHostname(urlOrHost: string | null | undefined): string | null {
  if (!urlOrHost) return null
  const raw = urlOrHost.trim().toLowerCase()
  if (!raw) return null
  try {
    const withProtocol = raw.includes("://") ? raw : `https://${raw}`
    let host = new URL(withProtocol).hostname.toLowerCase()
    if (host.startsWith("www.")) host = host.slice(4)
    return host || null
  } catch {
    let host = raw.replace(/^https?:\/\//, "").split("/")[0] ?? ""
    if (host.startsWith("www.")) host = host.slice(4)
    return host || null
  }
}

/** Second-level label: "bancocarregosa.com" → "bancocarregosa", "a.b.co.uk" → best-effort. */
export function registrableLabel(hostname: string | null | undefined): string | null {
  const host = normalizeHostname(hostname)
  if (!host) return null
  const parts = host.split(".").filter(Boolean)
  if (parts.length === 0) return null
  if (parts.length === 1) return parts[0] ?? null
  // Common multi-part public suffixes we care about for brand sites.
  const multiPartSuffixes = new Set(["co.uk", "com.br", "com.pt", "org.uk"])
  const lastTwo = parts.slice(-2).join(".")
  if (multiPartSuffixes.has(lastTwo) && parts.length >= 3) {
    return parts[parts.length - 3] ?? null
  }
  return parts[parts.length - 2] ?? null
}

export function normalizeBrandName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function domainsLooselyMatch(
  projectDomain: string | null | undefined,
  entityUrl: string | null | undefined,
): boolean {
  const projectHost = normalizeHostname(projectDomain)
  const entityHost = normalizeHostname(entityUrl)
  if (!projectHost || !entityHost) return false
  if (entityHost === projectHost) return true
  if (entityHost.endsWith(`.${projectHost}`) || projectHost.endsWith(`.${entityHost}`)) {
    return true
  }
  const projectLabel = registrableLabel(projectHost)
  const entityLabel = registrableLabel(entityHost)
  if (projectLabel && entityLabel && projectLabel === entityLabel) return true
  // e.g. project bancocarregosa.com vs entity carregosa.pt
  if (
    projectLabel &&
    entityLabel &&
    (projectLabel.includes(entityLabel) || entityLabel.includes(projectLabel)) &&
    Math.min(projectLabel.length, entityLabel.length) >= 6
  ) {
    return true
  }
  return false
}

export function brandNamesLooselyMatch(
  projectName: string | null | undefined,
  entityName: string | null | undefined,
): boolean {
  const a = normalizeBrandName(projectName)
  const b = normalizeBrandName(entityName)
  if (!a || !b) return false
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true
  // Token overlap for "Banco Carregosa" vs "Carregosa"
  const aTokens = new Set(a.split(" ").filter((t) => t.length >= 4))
  const bTokens = b.split(" ").filter((t) => t.length >= 4)
  return bTokens.some((t) => aTokens.has(t) || [...aTokens].some((at) => at.includes(t) || t.includes(at)))
}

export type RankedBrandEntity = {
  position: number
  name: string
  url: string | null
  snippet: string | null
}

export type BrandMatchInput = {
  projectDomain?: string | null
  projectName?: string | null
  aliases?: string[] | null
}

export function findBrandInRankedEntities(
  entities: RankedBrandEntity[],
  match: BrandMatchInput,
): RankedBrandEntity | null {
  const aliases = (match.aliases ?? [])
    .map((a) => a.trim())
    .filter(Boolean)

  for (const ent of entities) {
    if (domainsLooselyMatch(match.projectDomain, ent.url)) return ent
  }

  for (const ent of entities) {
    if (brandNamesLooselyMatch(match.projectName, ent.name)) return ent
    if (aliases.some((alias) => brandNamesLooselyMatch(alias, ent.name))) return ent
  }

  // Domain label vs entity name (carregosa ↔ Banco Carregosa)
  const label = registrableLabel(match.projectDomain)
  if (label) {
    for (const ent of entities) {
      if (brandNamesLooselyMatch(label, ent.name)) return ent
    }
  }

  return null
}
