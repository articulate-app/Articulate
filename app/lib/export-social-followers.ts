import { format } from "date-fns"
import { exportToCSV } from "../../lib/utils/export"
import type { ProjectSocialCompetitiveSummary } from "@/lib/services/project-social-analytics"

/**
 * Download entity-level follower stats for the current Competition period as CSV
 * (opens cleanly in Excel).
 */
export function exportSocialFollowersCsv(args: {
  projectName: string
  summary: ProjectSocialCompetitiveSummary
}) {
  const rows = args.summary.entities.map((entity) => ({
    Entity: entity.entity_name,
    Type: entity.is_owned ? "owned" : "competitor",
    Posts: entity.posts_count,
    Interactions: entity.interactions_total ?? "",
    "Followers (start)": entity.followers_start ?? "",
    "Followers (latest)": entity.followers_latest ?? "",
    "Followers delta": entity.followers_delta ?? "",
    "Followers delta %":
      entity.followers_delta_pct == null
        ? ""
        : Number(entity.followers_delta_pct.toFixed(2)),
    "Share of posts %":
      entity.share_of_posts_pct == null
        ? ""
        : Number(entity.share_of_posts_pct.toFixed(2)),
    "Share of interactions %":
      entity.share_of_interactions_pct == null
        ? ""
        : Number(entity.share_of_interactions_pct.toFixed(2)),
  }))

  if (rows.length === 0) return false

  const from = args.summary.date_from
    ? format(new Date(args.summary.date_from), "yyyy-MM-dd")
    : "start"
  const to = args.summary.date_to
    ? format(new Date(args.summary.date_to), "yyyy-MM-dd")
    : "end"
  const safeName = args.projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "project"

  exportToCSV(rows, `${safeName}-social-followers-${from}-${to}`)
  return true
}
