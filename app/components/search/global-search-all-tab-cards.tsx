"use client"

import { getGlobalSearchResultKey, type GlobalSearchDocument, type GlobalSearchSection } from "../../lib/global-search-types"
import { SearchResultRow } from "./SearchResultRow"

export function GlobalSearchAllSectionCards({
  section,
  viewScope,
  onSelect,
}: {
  section: GlobalSearchSection
  viewScope: string
  onSelect: (item: GlobalSearchDocument) => void
}) {
  return (
    <div className="overflow-hidden">
      {section.items.map((item, index) => (
        <SearchResultRow
          key={`${viewScope}:${section.type}:${getGlobalSearchResultKey(item)}:${index}`}
          item={item}
          onSelect={onSelect}
          sectionType={section.type}
        />
      ))}
    </div>
  )
}

export function GlobalSearchAiThreadList({
  items,
  onSelect,
}: {
  items: GlobalSearchDocument[]
  onSelect: (item: GlobalSearchDocument) => void
}) {
  return (
    <div>
      {items.map((item) => (
        <SearchResultRow
          key={`ai:${getGlobalSearchResultKey(item)}`}
          item={item}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}
