"use client"

import { cn } from "@/lib/utils"
import { useElementWidth } from "../../hooks/use-element-width"

export const USER_STAT_CARD_WIDTH_PX = 220
const CARD_GAP_PX = 16

/** Minimum container width to show N stat cards in a grid without compression. */
export function getUserStatCardsGridMinWidth(gridColumns: number): number {
  return USER_STAT_CARD_WIDTH_PX * gridColumns + CARD_GAP_PX * (gridColumns - 1)
}

/** @deprecated Use getUserStatCardsGridMinWidth(4) */
export const USER_STAT_CARDS_GRID_MIN_WIDTH = getUserStatCardsGridMinWidth(4)

export type UserStatCard = {
  id: string
  label: string
  value: React.ReactNode
  hint?: string
  footer?: React.ReactNode
  valueClassName?: string
}

/** @deprecated Use UserStatCard */
export type UserOverviewStatCard = UserStatCard & { hint: string }

const CAROUSEL_CARD_CLASS =
  "max-w-[280px] min-w-[220px] shrink-0 basis-[calc(100%/1.1)] snap-start"

/** Matches user pane tab content horizontal padding (`TabsContent` uses `p-6`). */
export const USER_PANE_SECTION_X_CLASS = "px-6"

/** Bleed carousel scroll track to pane edges while inner row keeps section padding. */
const USER_PANE_CAROUSEL_BLEED_CLASS = "-mx-6"

/**
 * Stat cards that use container width — not viewport breakpoints — to switch between a multi-column
 * grid (wide pane) and a horizontal carousel (~1.1 cards visible, hidden scrollbar) when narrow.
 */
export function UserStatCardsCarousel({
  cards,
  gridColumns = 4,
  className,
}: {
  cards: UserStatCard[]
  gridColumns?: number
  className?: string
}) {
  const { ref, width } = useElementWidth<HTMLDivElement>()
  const gridMinWidth = getUserStatCardsGridMinWidth(gridColumns)
  // Default to carousel until measured so narrow panes never flash a cramped grid.
  const useCarousel = width == null || width < gridMinWidth

  return (
    <div ref={ref} className={cn("min-w-0", className)}>
      {useCarousel ? (
        <div
          className={cn(
            "scrollbar-hide overflow-x-auto overscroll-x-contain",
            USER_PANE_CAROUSEL_BLEED_CLASS,
          )}
        >
          <div
            className={cn(
              "flex w-max flex-nowrap snap-x snap-mandatory gap-4",
              USER_PANE_SECTION_X_CLASS,
            )}
          >
            {cards.map((card) => (
              <div key={card.id} className={cn("rounded-lg border border-gray-200 bg-white p-4", CAROUSEL_CARD_CLASS)}>
                <div className="text-sm font-medium text-gray-500">{card.label}</div>
                <div className={cn("mt-1 text-2xl font-bold text-gray-900", card.valueClassName)}>
                  {card.value}
                </div>
                {card.footer ? (
                  card.footer
                ) : card.hint ? (
                  <div className="mt-1 text-xs text-gray-400">{card.hint}</div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}
        >
          {cards.map((card) => (
            <div key={card.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="text-sm font-medium text-gray-500">{card.label}</div>
              <div className={cn("mt-1 text-2xl font-bold text-gray-900", card.valueClassName)}>
                {card.value}
              </div>
              {card.footer ? (
                card.footer
              ) : card.hint ? (
                <div className="mt-1 text-xs text-gray-400">{card.hint}</div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * User overview stat cards (Upcoming, Overdue, Publication, Projects).
 */
export function UserOverviewStatCards({ cards }: { cards: UserOverviewStatCard[] }) {
  return <UserStatCardsCarousel cards={cards} gridColumns={4} className="mb-8" />
}

/**
 * Occupation tab summary cards (Today, Yesterday, 7d, 30d, Backlog).
 */
export function UserOccupationStatCards({ cards }: { cards: UserStatCard[] }) {
  return <UserStatCardsCarousel cards={cards} gridColumns={5} className="mb-6" />
}
