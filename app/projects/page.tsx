'use client'
import { useState, useEffect, useMemo } from "react"
import dynamic from "next/dynamic"
import { getProjectCards } from "../lib/services/projects"
import { ProjectCardComponent } from "../components/projects/project-card"
import type { ProjectCard } from "../lib/types/index"
import { Sidebar } from "../components/tasks/Sidebar"

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectCard[]>([])
  const [selectedProject, setSelectedProject] = useState<ProjectCard | null>(null)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  // Dynamic import for detail panel
  const ProjectDetailPanel = useMemo(
    () => dynamic(() => import("../components/projects/project-detail-panel").then(mod => mod.ProjectDetailPanel), { ssr: false }),
    []
  )

  useEffect(() => {
    getProjectCards().then(setProjects).catch(console.error)
  }, [])

  const handleCardClick = (project: ProjectCard) => {
    setSelectedProject(project)
    setIsPanelOpen(true)
  }

  const handlePanelClose = () => {
    setIsPanelOpen(false)
    setSelectedProject(null)
  }

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <div className={`border-r border-gray-200 transition-all duration-300 ease-in-out z-20 flex-shrink-0 ${isSidebarCollapsed ? 'w-16' : 'w-64'}`}>
        <Sidebar isCollapsed={isSidebarCollapsed} />
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-3 top-1/2 transform -translate-y-1/2 bg-white border rounded-full p-1 shadow-md hidden md:block"
        >
          {isSidebarCollapsed ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          )}
        </button>
      </div>
      {/* Main Content */}
      <div className="flex-1 flex flex-col w-full">
        <header className="h-16 border-b border-gray-200 px-4 flex items-center justify-between bg-white">
          <h1 className="text-xl font-semibold">Projects</h1>
        </header>
        <main className="flex-1 overflow-auto bg-gray-50 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {projects.map(project => (
              <ProjectCardComponent
                key={project.id}
                project={project}
                onClick={() => handleCardClick(project)}
              />
            ))}
          </div>
          <ProjectDetailPanel
            isOpen={isPanelOpen}
            onClose={handlePanelClose}
            project={selectedProject}
          />
        </main>
      </div>
    </div>
  )
} 