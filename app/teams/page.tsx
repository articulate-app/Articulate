'use client'

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Sidebar } from "../components/ui/Sidebar"
import { Users, Loader2 } from "lucide-react"

export default function TeamsPage() {
  const router = useRouter()
  const supabase = createClientComponentClient()
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true)

  // Fetch teams
  const { data: teams, isLoading } = useQuery({
    queryKey: ['teams-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_teams_minimal')
        .select('id, title, logo')
        .order('title')
      if (error) throw error
      return data || []
    },
  })

  const handleTeamClick = (teamId: number) => {
    router.push(`/teams/${teamId}`)
  }

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <div className={`border-r border-gray-200 transition-all duration-300 ease-in-out z-20 flex-shrink-0 ${isSidebarCollapsed ? 'w-16' : 'w-64'}`}>
        <Sidebar isCollapsed={isSidebarCollapsed} />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col w-full">
        <header className="h-16 border-b border-gray-200 px-6 flex items-center justify-between bg-white">
          <h1 className="text-xl font-semibold">Teams</h1>
        </header>

        <main className="flex-1 overflow-auto bg-gray-50 p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : teams && teams.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {teams.map(team => (
                <button
                  key={team.id}
                  onClick={() => handleTeamClick(team.id)}
                  className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow text-left"
                >
                  <div className="flex items-center gap-3 mb-3">
                    {team.logo ? (
                      <img 
                        src={team.logo} 
                        alt={team.title}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                        <Users className="w-6 h-6 text-white" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{team.title}</h3>
                    </div>
                  </div>
                  <div className="text-sm text-gray-500">
                    Click to view team details
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Users className="w-16 h-16 text-gray-300 mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">No teams yet</h2>
              <p className="text-gray-500 max-w-md">
                Teams will appear here once they are created. Teams help organize members and projects.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

