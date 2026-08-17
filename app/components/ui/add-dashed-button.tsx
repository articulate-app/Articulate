"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"

export type AddDashedButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label?: string
}

/**
 * Small minimalist “+ Add” pill used across entity lists
 * (attachments, reviews, artifacts, keywords, etc.).
 */
export const AddDashedButton = React.forwardRef<HTMLButtonElement, AddDashedButtonProps>(
  ({ label = "Add", className, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "mt-2 inline-flex h-7 w-auto items-center justify-center gap-1",
        "rounded-full border border-gray-200 bg-white px-2.5",
        "text-xs font-normal text-gray-600 transition-colors",
        "hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <Plus className="h-3 w-3" aria-hidden />
      {label}
    </button>
  ),
)
AddDashedButton.displayName = "AddDashedButton"
