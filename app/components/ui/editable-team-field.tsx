'use client'

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { CustomTeamDropdown } from './custom-team-dropdown'

interface EditableTeamFieldProps {
  value: number | null | undefined
  onSave: (value: string) => Promise<void>
  placeholder?: string
  className?: string
  isEditMode?: boolean // Controlled editing state
  isEditable?: boolean // Whether field can be edited (default: true)
}

export function EditableTeamField({
  value,
  onSave,
  placeholder = 'Select team',
  className = '',
  isEditMode = false,
  isEditable = true,
}: EditableTeamFieldProps) {
  const [editValue, setEditValue] = useState(String(value || ''))
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLocalEditing, setIsLocalEditing] = useState(false)
  const [teams, setTeams] = useState<Array<{ id: number; title: string }>>([])
  const [isLoadingTeams, setIsLoadingTeams] = useState(false)

  // Load teams on mount for immediate display
  useEffect(() => {
    loadTeams()
  }, [])

  // Initialize edit value when entering edit mode
  useEffect(() => {
    if (isEditMode || isLocalEditing) {
      setEditValue(String(value || ''))
      setError(null)
    }
  }, [isEditMode, isLocalEditing, value])

  // Handle click to edit
  const handleClick = () => {
    if (!isEditable) return
    setIsLocalEditing(true)
    setEditValue(String(value || ''))
    setError(null)
  }

  const loadTeams = async () => {
    setIsLoadingTeams(true)
    try {
      const supabase = createClientComponentClient()
      
      // Fetch from all three views and merge
      // Note: v_suppliers_teams has team_name, v_teams_i_belong_to has team_title, v_clients_teams has title
      const [suppliersRes, myTeamsRes, clientsRes] = await Promise.all([
        supabase.from('v_suppliers_teams').select('team_id, team_name'),
        supabase.from('v_teams_i_belong_to').select('team_id, team_title'),
        supabase.from('v_clients_teams').select('team_id, title'),
      ])

      const allTeams: Array<{ id: number; title: string }> = []
      
      // Add suppliers (uses team_name)
      if (suppliersRes.data) {
        suppliersRes.data.forEach((t: any) => {
          if (!allTeams.find(existing => existing.id === t.team_id)) {
            allTeams.push({ id: t.team_id, title: t.team_name })
          }
        })
      }
      
      // Add my teams (uses team_title)
      if (myTeamsRes.data) {
        myTeamsRes.data.forEach((t: any) => {
          if (!allTeams.find(existing => existing.id === t.team_id)) {
            allTeams.push({ id: t.team_id, title: t.team_title })
          }
        })
      }
      
      // Add clients (uses title)
      if (clientsRes.data) {
        clientsRes.data.forEach((t: any) => {
          if (!allTeams.find(existing => existing.id === t.team_id)) {
            allTeams.push({ id: t.team_id, title: t.title })
          }
        })
      }

      // Sort by title
      allTeams.sort((a, b) => a.title.localeCompare(b.title))
      
      setTeams(allTeams)
    } catch (err) {
      console.error('Failed to load teams:', err)
      setError('Failed to load teams')
    } finally {
      setIsLoadingTeams(false)
    }
  }

  // Get display name for the current value
  const displayValue = teams.find(t => t.id === value)?.title || placeholder

  // Handle change from dropdown
  const handleChange = async (newValue: string) => {
    // If value unchanged, no need to save
    if (newValue === String(value || '')) {
      setIsLocalEditing(false)
      return
    }

    setEditValue(newValue)
    setIsSaving(true)
    setError(null)

    try {
      await onSave(newValue)
      setIsLocalEditing(false)
    } catch (err) {
      console.error('Failed to save:', err)
      setError('Failed to save')
      // Revert to original value
      setEditValue(String(value || ''))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="relative flex justify-end">
      {(isEditMode || isLocalEditing) ? (
        <div className="flex items-center gap-2 w-full max-w-[200px]">
          <CustomTeamDropdown
            value={editValue}
            onChange={handleChange}
            options={teams}
            disabled={isSaving || isLoadingTeams}
            placeholder={placeholder}
          />
          {isSaving && (
            <span className="text-xs text-gray-500 whitespace-nowrap">Saving...</span>
          )}
        </div>
      ) : (
        <span 
          className={`text-sm text-gray-900 text-right ${isEditable ? 'cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5' : ''}`}
          onClick={handleClick}
        >
          {displayValue || <span className="text-gray-400">{placeholder}</span>}
        </span>
      )}
      {error && (
        <div className="absolute top-full right-0 mt-1 text-xs text-red-600 bg-red-50 px-2 py-1 rounded shadow-sm z-10">
          {error}
        </div>
      )}
    </div>
  )
}

