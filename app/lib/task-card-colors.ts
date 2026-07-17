/**
 * Shared color logic for task cards (Calendar + Kanban).
 * Same palette hashing so colors remain consistent across views.
 */

export type TaskCardColorMode = 'contentType' | 'assignedTo' | 'project' | 'status';

const COLOR_PALETTE = [
  'bg-blue-200 text-blue-900',
  'bg-green-200 text-green-900',
  'bg-pink-200 text-pink-900',
  'bg-yellow-200 text-yellow-900',
  'bg-purple-200 text-purple-900',
  'bg-orange-200 text-orange-900',
  'bg-teal-200 text-teal-900',
  'bg-red-200 text-red-900',
  'bg-cyan-200 text-cyan-900',
  'bg-lime-200 text-lime-900',
  'bg-fuchsia-200 text-fuchsia-900',
  'bg-amber-200 text-amber-900',
];

/** Deterministic hash to keep color stable across scrolling/filtering. */
export function getStablePaletteClass(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = ((hash << 5) - hash) + key.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % COLOR_PALETTE.length;
  return COLOR_PALETTE[index] || 'bg-gray-100 text-gray-900';
}

/** Get color key for a task based on color mode. */
export function getTaskColorKey(task: any, colorMode: TaskCardColorMode): string {
  if (colorMode === 'assignedTo') return String(task.assigned_to_name || task.assigned_to_id || 'unassigned');
  if (colorMode === 'project') {
    const projectName = task.project_name ?? task.projects?.name;
    return String(projectName || task.project_id_int || 'no-project');
  }
  if (colorMode === 'status') return String(task.project_status_name || 'no-status');
  if (colorMode === 'contentType') return String(task.content_type_title || task.content_type_id || 'no-content-type');
  return 'none';
}

/** Get palette class for a task. */
export function getTaskColorClass(task: any, colorMode: TaskCardColorMode): string {
  const key = getTaskColorKey(task, colorMode);
  return getStablePaletteClass(key);
}

/** Get label for legend (same as Calendar getColorLabel). */
export function getTaskColorLabel(task: any, colorMode: TaskCardColorMode): string {
  if (colorMode === 'assignedTo') return task.assigned_to_name || (task.assigned_to_id ? String(task.assigned_to_id) : 'Unassigned');
  if (colorMode === 'project') return task.project_name || 'No project';
  if (colorMode === 'status') return task.project_status_name || 'No status';
  if (colorMode === 'contentType') return task.content_type_title || task.content_type_id || 'No content type';
  return '—';
}

/** Bar uses bg class only (no text color). */
export function getStablePaletteBarClass(key: string): string {
  const full = getStablePaletteClass(key);
  return full.split(' ')[0] || 'bg-gray-200';
}

/** For status/project modes, use inline color from DB when available. */
export function getTaskInlineStyle(task: any, colorMode: TaskCardColorMode): { background: string; color: string } | undefined {
  const statusColor = task.project_status_color ?? task.project_statuses?.color;
  const projectColor = task.project_color ?? task.projects?.color;
  if (colorMode === 'status' && statusColor) {
    return { background: statusColor, color: '#222' };
  }
  if (colorMode === 'project' && projectColor) {
    return { background: projectColor, color: '#222' };
  }
  return undefined;
}

/** Hex strokes for list row left accent (aligned with palette hash in getStablePaletteClass). */
const PALETTE_HEX = [
  '#bfdbfe',
  '#bbf7d0',
  '#fbcfe8',
  '#fef08a',
  '#e9d5ff',
  '#fed7aa',
  '#99f6e4',
  '#fecaca',
  '#a5f3fc',
  '#d9f99d',
  '#f5d0fe',
  '#fde68a',
] as const;

/**
 * Solid color for a minimal list-row accent (inset bar / border) when not using DB inline colors.
 */
export function getTaskListRowAccentColor(task: any, colorMode: TaskCardColorMode): string | undefined {
  const inline = getTaskInlineStyle(task, colorMode);
  if (inline) return inline.background;
  const key = getTaskColorKey(task, colorMode);
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  return PALETTE_HEX[Math.abs(hash) % PALETTE_HEX.length];
}
