"use client"

import { cn } from "@/lib/utils"

export function MobileScopePills<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: readonly { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 shrink-0 items-center gap-1 overflow-x-auto overflow-y-hidden bg-white px-4 pb-2 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {options.map((tab) => {
        const isActive = value === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center rounded-full px-3 text-[15px] font-medium transition-colors",
              isActive ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-700",
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
