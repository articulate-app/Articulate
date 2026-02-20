import { cn } from "@/lib/utils"

type UserAvatarProps = {
  name: string | null
  photoUrl?: string | null
  size?: "sm" | "md" | "lg"
}

export function UserAvatar({ name, photoUrl, size = "sm" }: UserAvatarProps) {
  const initials =
    name
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0]?.toUpperCase())
      .join("") || "?"

  const sizeClasses =
    size === "sm"
      ? "h-8 w-8 min-h-8 min-w-8 text-xs"
      : size === "md"
      ? "h-10 w-10 min-h-10 min-w-10 text-sm"
      : "h-12 w-12 min-h-12 min-w-12 text-base"

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name || "User"}
        className={cn("rounded-full object-cover aspect-square flex-shrink-0", sizeClasses)}
      />
    )
  }

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-medium bg-gray-200 text-gray-700 aspect-square flex-shrink-0",
        sizeClasses
      )}
    >
      {initials}
    </div>
  )
}


