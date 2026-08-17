import { cn } from '@/lib/utils'
import { getImageUrl } from '../../lib/public-media'

type EditFieldsLike = {
  project_statuses?: { id: number; name: string; color?: string | null }[]
  projects?: { id: number; name: string; color?: string | null; logo?: string | null }[]
}

export function TaskStatusPill({
  name,
  color,
  className,
  variant = 'pill',
}: {
  name: string
  color?: string | null
  className?: string
  /** `plain` — directory-style meta text with optional color dot (task list). */
  variant?: 'pill' | 'plain'
}) {
  if (variant === 'plain') {
    return (
      <span className={cn('inline-flex min-w-0 items-center gap-1.5 text-[15px] font-normal leading-snug text-gray-800', className)}>
        {color ? (
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden
          />
        ) : null}
        <span className="truncate">{name}</span>
      </span>
    )
  }
  const bg = color || '#e5e7eb'
  const textColor = color ? '#fff' : '#374151'
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-normal leading-none min-h-[22px] h-[22px]',
        className,
      )}
      style={{ backgroundColor: bg, color: textColor }}
    >
      {name}
    </span>
  )
}

export function ProjectMarker({
  name,
  logo,
  color,
  size = 'sm',
  showLabel = true,
  className,
}: {
  name?: string | null
  logo?: string | null
  color?: string | null
  size?: 'sm' | 'md'
  showLabel?: boolean
  className?: string
}) {
  const logoUrl = logo ? getImageUrl(logo) : null
  const iconSize = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'
  const dotSize = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      {logoUrl ? (
        <img src={logoUrl} alt="" className={cn('shrink-0 rounded-sm object-cover', iconSize)} />
      ) : (
        <span
          aria-hidden
          className={cn('shrink-0 rounded-full', dotSize)}
          style={{ backgroundColor: color || '#d1d5db' }}
        />
      )}
      {showLabel && name ? <span className="truncate">{name}</span> : null}
    </span>
  )
}

function resolveStatusColor(label: string, groupKey: string, editFields?: EditFieldsLike): string | null {
  const statuses = editFields?.project_statuses ?? []
  const match =
    statuses.find((s) => s.name === label) ??
    statuses.find((s) => s.name === groupKey) ??
    null
  return match?.color ?? null
}

function resolveProjectMeta(
  groupKey: string,
  label: string,
  editFields?: EditFieldsLike,
): { name: string; color?: string | null; logo?: string | null } {
  const projects = editFields?.projects ?? []
  const id = Number.parseInt(groupKey, 10)
  const match = Number.isFinite(id) ? projects.find((p) => p.id === id) : undefined
  return {
    name: match?.name ?? label,
    color: match?.color ?? null,
    logo: match?.logo ?? null,
  }
}

export function TaskGroupHeaderLabel({
  groupBy,
  groupKey,
  label,
  editFields,
  directoryStyle = false,
}: {
  groupBy: string | null
  groupKey: string
  label: string
  editFields?: EditFieldsLike
  /** Match AI chats / templates section labels (plain gray text). */
  directoryStyle?: boolean
}) {
  if (directoryStyle) {
    if (groupBy === 'status') {
      return <>{label}</>
    }
    if (groupBy === 'project') {
      const project = resolveProjectMeta(groupKey, label, editFields)
      return <>{project.name}</>
    }
    return <>{label}</>
  }

  if (groupBy === 'status') {
    return (
      <TaskStatusPill
        name={label}
        color={resolveStatusColor(label, groupKey, editFields)}
        className="font-normal"
      />
    )
  }

  if (groupBy === 'project') {
    const project = resolveProjectMeta(groupKey, label, editFields)
    return (
      <span className="min-w-0 text-xs font-normal">
        <ProjectMarker
          name={project.name}
          logo={project.logo}
          color={project.color}
          size="sm"
        />
      </span>
    )
  }

  return <span className="truncate text-xs font-normal text-gray-700">{label}</span>
}

export function FilterOptionVisual({
  categoryId,
  label,
  color,
  logo,
}: {
  categoryId: string
  label: string
  color?: string | null
  logo?: string | null
}) {
  if (categoryId === 'status') {
    return <TaskStatusPill name={label} color={color} />
  }
  if (categoryId === 'project') {
    return <ProjectMarker name={label} logo={logo} color={color} size="sm" />
  }
  return <span className="truncate">{label}</span>
}
