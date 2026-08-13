import type { SVGProps } from "react"

/** Cursor / VS Code–style layout-sidebar glyph (minimal panel with a side strip). */
export function PaneOpenIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
      {...props}
    >
      <rect
        x="1.75"
        y="2.75"
        width="12.5"
        height="10.5"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M10.5 3.25v9.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}
