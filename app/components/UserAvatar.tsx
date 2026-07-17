import { cn } from "@/lib/utils"

type UserAvatarProps = {
  name: string | null
  photoUrl?: string | null
  size?: "xs" | "sm" | "md" | "lg"
  className?: string
}

const SIZE_CLASSES: Record<NonNullable<UserAvatarProps["size"]>, string> = {
  xs: "h-6 w-6 min-h-6 min-w-6 text-[10px]",
  sm: "h-8 w-8 min-h-8 min-w-8 text-xs",
  md: "h-10 w-10 min-h-10 min-w-10 text-sm",
  lg: "h-12 w-12 min-h-12 min-w-12 text-base",
}

/**
 * Fixed-size circular avatar shell. Photos use object-cover inside an overflow-hidden
 * container so flex layouts never stretch or squash the image in narrow panes.
 */
export function UserAvatar({ name, photoUrl, size = "sm", className }: UserAvatarProps) {
  const initials =
    name
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0]?.toUpperCase())
      .join("") || "?"

  const shellClass = cn("shrink-0 overflow-hidden rounded-full", SIZE_CLASSES[size], className)

  if (photoUrl) {
    return (
      <div className={shellClass}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl}
          alt={name || "User"}
          className="h-full w-full object-cover object-center"
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        shellClass,
        "flex items-center justify-center bg-gray-200 font-medium text-gray-700",
      )}
      aria-label={name || "User"}
    >
      {initials}
    </div>
  )
}
