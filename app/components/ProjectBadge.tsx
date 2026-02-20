import { cn } from "@/lib/utils"

type ProjectBadgeProps = {
  name: string | null
  logoUrl?: string | null
  color?: string | null
  size?: "sm" | "md"
}

export function ProjectBadge({
  name,
  logoUrl,
  color,
  size = "sm",
}: ProjectBadgeProps) {
  const logoSizeClasses =
    size === "sm"
      ? "h-8 w-8 text-xs"
      : "h-10 w-10 text-sm"

  if (logoUrl) {
    return (
      <div className="flex items-center gap-2">
        <img
          src={logoUrl}
          alt={name || "Project"}
          className={cn("rounded-full object-cover", logoSizeClasses)}
        />
        {name && <span className="truncate">{name}</span>}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "rounded-full flex-shrink-0",
          size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5"
        )}
        style={{ backgroundColor: color || "#e5e7eb" }}
      />
      {name && <span className="truncate">{name}</span>}
    </div>
  )
}


