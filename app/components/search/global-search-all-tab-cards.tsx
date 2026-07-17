"use client"

import { getGlobalSearchResultKey, type GlobalSearchDocument, type GlobalSearchSection } from "../../lib/global-search-types"
import { SearchResultRow } from "./SearchResultRow"

function RowList({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-gray-200">{children}</div>
}

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
      <RowList>
      {section.items.map((item, index) => (
        <SearchResultRow
          key={`${viewScope}:${section.type}:${getGlobalSearchResultKey(item)}:${index}`}
          item={item}
          onSelect={onSelect}
          sectionType={section.type}
        />
      ))}
      </RowList>
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
    <div className="divide-y divide-gray-200">
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
