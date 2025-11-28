import { useEffect, useState } from "react"
import { SlidePanel } from "../ui/slide-panel"
import { getProjectDetails } from "../../lib/services/projects"
import { ProjectBriefingsPanel } from "../../../features/projects/ProjectSettings/ProjectBriefingsPanel"

interface ProjectDetailPanelProps {
  isOpen: boolean
  onClose: () => void
  project: { id: number } | null
}

export function ProjectDetailPanel({ isOpen, onClose, project }: ProjectDetailPanelProps) {
  const [details, setDetails] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    if (!project) return
    setIsLoading(true)
    setHasError(false)
    getProjectDetails(project.id)
      .then(setDetails)
      .catch(() => setHasError(true))
      .finally(() => setIsLoading(false))
  }, [project])

  if (!project) return null

  return (
    <SlidePanel isOpen={isOpen} onClose={onClose} position="right" className="w-[400px]">
      {isLoading ? (
        <div className="flex items-center justify-center h-32 text-gray-500">Loading...</div>
      ) : hasError ? (
        <div className="flex items-center justify-center h-32 text-red-500">Error loading project details.</div>
      ) : details ? (
        <div className="space-y-4">
          <div className="text-lg font-semibold mb-2">{details.name}</div>
          <div className="text-xs text-gray-500 mb-2">Created: {details.created_at ? new Date(details.created_at).toLocaleDateString() : "—"}</div>
          <div className="mb-2">
            <div className="font-medium text-gray-700">Team</div>
            <div className="flex flex-wrap gap-2 mt-1">
              {details.team.map((user: any) => (
                <span key={user.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 border border-gray-200 text-gray-700 text-xs font-medium shadow-sm">
                  {user.full_name}
                </span>
              ))}
            </div>
          </div>
          <div className="mb-2">
            <div className="font-medium text-gray-700">Description</div>
            <div className="text-gray-800 text-sm whitespace-pre-line">{details.description || <span className="text-gray-400">—</span>}</div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="font-medium text-gray-700">Goals:</span> <span className="text-gray-800">{details.goals || "—"}</span></div>
            <div><span className="font-medium text-gray-700">Targets:</span> <span className="text-gray-800">{details.targets || "—"}</span></div>
            <div><span className="font-medium text-gray-700">Deliverables:</span> <span className="text-gray-800">{details.deliverables || "—"}</span></div>
            <div><span className="font-medium text-gray-700">Editorial Line:</span> <span className="text-gray-800">{details.editorial_line || "—"}</span></div>
            <div><span className="font-medium text-gray-700">Topics:</span> <span className="text-gray-800">{details.topics || "—"}</span></div>
            <div><span className="font-medium text-gray-700">Project URL:</span> <a href={details.project_url} className="text-blue-600 underline" target="_blank" rel="noopener noreferrer">{details.project_url || "—"}</a></div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="font-medium text-gray-700">Billing Type:</span> <span className="text-gray-800">{details.billing_type?.title || "—"}</span></div>
            <div><span className="font-medium text-gray-700">Team:</span> <span className="text-gray-800">{details.team_id?.title || "—"}</span></div>
            <div><span className="font-medium text-gray-700">Languages:</span> <span className="text-gray-800">{details.languages.map((l: any) => l.code).join(", ") || "—"}</span></div>
            <div><span className="font-medium text-gray-700">Sectors:</span> <span className="text-gray-800">{details.sectors.map((s: any) => s.title).join(", ") || "—"}</span></div>
          </div>
          <div className="mb-2">
            <div className="font-medium text-gray-700">Project Statuses</div>
            <div className="flex flex-wrap gap-2 mt-1">
              {details.project_statuses.length > 0 ? details.project_statuses.map((status: any) => (
                <span key={status.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-200 text-gray-700 text-xs font-medium">
                  {status.name}
                </span>
              )) : <span className="text-gray-400">—</span>}
            </div>
          </div>
          <div>
            <div className="font-medium text-gray-700 mb-1">Threads (Project)</div>
            {details.threads_project.length > 0 ? (
              <ul className="list-disc pl-5 text-xs space-y-1">
                {details.threads_project.map((thread: any) => (
                  <li key={thread.id}>
                    <span className="font-medium text-gray-800">{thread.title}</span>
                    <span className="text-gray-400 ml-2">{thread.created_at ? new Date(thread.created_at).toLocaleDateString() : ""}</span>
                  </li>
                ))}
              </ul>
            ) : <span className="text-gray-400 text-xs">No project threads.</span>}
          </div>
          <div>
            <div className="font-medium text-gray-700 mb-1">Threads (Tasks in Project)</div>
            {details.threads_tasks.length > 0 ? (
              <ul className="list-disc pl-5 text-xs space-y-1">
                {details.threads_tasks.map((thread: any) => (
                  <li key={thread.id}>
                    <span className="font-medium text-gray-800">{thread.title}</span>
                    <span className="text-gray-400 ml-2">{thread.created_at ? new Date(thread.created_at).toLocaleDateString() : ""}</span>
                  </li>
                ))}
              </ul>
            ) : <span className="text-gray-400 text-xs">No task threads.</span>}
          </div>
          
          {/* Briefings Section */}
          <div className="border-t pt-4 mt-4">
            <ProjectBriefingsPanel projectId={project.id} />
          </div>
        </div>
      ) : null}
    </SlidePanel>
  )
} 