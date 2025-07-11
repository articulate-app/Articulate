import { Card, CardHeader, CardTitle, CardContent } from "../ui/card"
import { Button } from "../ui/button"
import { MoreVertical } from "lucide-react"
import * as React from "react"
import type { ProjectCard } from "../../lib/types/index"

interface ProjectCardProps {
  project: ProjectCard
  onClick: () => void
  onAction?: (action: string) => void
}

export function ProjectCardComponent({ project, onClick, onAction }: ProjectCardProps) {
  return (
    <Card
      className="flex flex-col justify-between min-h-[180px] cursor-pointer hover:shadow-lg transition-shadow focus-within:ring-2 focus-within:ring-blue-500"
      tabIndex={0}
      onClick={onClick}
      role="button"
      aria-label={`Open project ${project.name}`}
    >
      <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
        <CardTitle className="text-base font-semibold truncate max-w-[70%]">
          {project.name}
        </CardTitle>
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full p-2"
            tabIndex={-1}
            aria-label="Project actions"
            onClick={e => {
              e.stopPropagation()
              onAction && onAction("menu")
            }}
          >
            <MoreVertical className="w-5 h-5" />
          </Button>
          {/* Actions menu (UI only) */}
        </div>
      </CardHeader>
      <CardContent className="flex flex-row items-end justify-between p-4 pt-0">
        {/* Team avatars */}
        <div className="flex -space-x-2">
          {project.team.slice(0, 5).map((user: { id: string; full_name: string }) => (
            <span
              key={user.id}
              className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 border border-gray-200 text-gray-700 text-sm font-medium shadow-sm"
              title={user.full_name}
              style={{ minWidth: 32, minHeight: 32 }}
            >
              {user.full_name
                .split(" ")
                .map((n: string) => n[0])
                .join("")
                .toUpperCase()}
            </span>
          ))}
          {project.team.length > 5 && (
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 border border-gray-300 text-gray-600 text-xs font-medium shadow-sm">
              +{project.team.length - 5}
            </span>
          )}
        </div>
        {/* Last activity */}
        <div className="text-xs text-gray-500 text-right">
          <div className="font-medium">Last activity</div>
          <div>
            {project.lastActivity
              ? new Date(project.lastActivity).toLocaleDateString()
              : "—"}
          </div>
        </div>
      </CardContent>
    </Card>
  )
} 