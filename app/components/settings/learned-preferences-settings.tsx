"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Check, Loader2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  changeAiPreferenceScope,
  createAiPreference,
  listAiPreferences,
  updateAiPreference,
  type AiPreference,
  type AiPreferenceCategory,
  type AiPreferenceScope,
} from "@/lib/services/ai-preferences"

type ProjectOption = { id: number; name: string }
type ViewMode = "personal" | "project"

const CATEGORY_LABELS: Record<AiPreference["category"], string> = {
  tone: "Tone",
  terminology: "Terminology",
  structure: "Structure",
  formatting: "Formatting",
  other: "Other",
}

function PreferenceRow({ preference, currentProjectId, onChanged }: { preference: AiPreference; currentProjectId: number | null; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [rule, setRule] = useState(preference.rule)
  const mutation = useMutation({
    mutationFn: async (action: "update" | "forget" | "activate") => {
      if (action === "update" && rule.trim().length < 3) throw new Error("Preference is too short.")
      return updateAiPreference({ id: preference.id, rule: action === "update" ? rule.trim() : undefined, action })
    },
    onSuccess: () => {
      setEditing(false)
      onChanged()
    },
  })
  const scopeMutation = useMutation({
    mutationFn: (scope: AiPreferenceScope) => changeAiPreferenceScope({ id: preference.id, scope, projectId: scope === "user" ? null : currentProjectId }),
    onSuccess: onChanged,
  })

  const scopeLabel = preference.scope === "project" ? "Shared project" : preference.scope === "user_project" ? "Personal · this project" : "Personal"

  return (
    <div className="border-b border-gray-100 py-4 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span>{CATEGORY_LABELS[preference.category]}</span><span>·</span><span>{scopeLabel}</span><span>·</span>
            <span className={preference.status === "active" ? "font-medium text-green-700" : "font-medium text-amber-700"}>{preference.status === "active" ? "Active" : "Still learning"}</span>
          </div>
          {editing ? (
            <div className="space-y-2">
              <Input value={rule} onChange={(event) => setRule(event.target.value)} maxLength={600} disabled={mutation.isPending} />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => mutation.mutate("update")} disabled={mutation.isPending || rule.trim().length < 3}>{mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Save</Button>
                <Button size="sm" variant="outline" onClick={() => { setRule(preference.rule); setEditing(false) }} disabled={mutation.isPending}>Cancel</Button>
              </div>
            </div>
          ) : <p className="text-sm leading-6 text-gray-900">{preference.rule}</p>}
          <div className="mt-2 text-xs text-gray-400">{preference.evidence_count} {preference.evidence_count === 1 ? "observation" : "observations"}{preference.status === "candidate" ? ` · ${Math.round(Number(preference.confidence) * 100)}% confidence` : ""}</div>
          {mutation.error || scopeMutation.error ? <p className="mt-2 text-xs text-red-600">{(mutation.error ?? scopeMutation.error) instanceof Error ? (mutation.error ?? scopeMutation.error as Error).message : "Could not update preference."}</p> : null}
        </div>
        {!editing && preference.editable ? (
          <div className="flex shrink-0 items-center gap-1">
            {currentProjectId ? (
              <Select value={preference.scope} onValueChange={(value) => scopeMutation.mutate(value as AiPreferenceScope)} disabled={scopeMutation.isPending}>
                <SelectTrigger className="h-8 w-[185px] text-xs" title="Change scope"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Personal</SelectItem>
                  <SelectItem value="user_project">Personal · this project</SelectItem>
                  <SelectItem value="project">Shared project</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
            {preference.status === "candidate" ? <Button variant="ghost" size="sm" onClick={() => mutation.mutate("activate")} disabled={mutation.isPending} title="Use this preference"><Check className="h-4 w-4" /></Button> : null}
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)} disabled={mutation.isPending} title="Edit preference"><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => mutation.mutate("forget")} disabled={mutation.isPending} title="Forget preference" className="text-gray-500 hover:text-red-600">{mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function LearnedPreferencesSettingsPanel() {
  const queryClient = useQueryClient()
  const supabase = useMemo(() => createClientComponentClient(), [])
  const [view, setView] = useState<ViewMode>("personal")
  const [projectId, setProjectId] = useState<string>("")
  const [adding, setAdding] = useState(false)
  const [newRule, setNewRule] = useState("")
  const [newCategory, setNewCategory] = useState<AiPreferenceCategory>("other")
  const [newScope, setNewScope] = useState<AiPreferenceScope>("user")

  const projectsQuery = useQuery({
    queryKey: ["learned-preferences-projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id,name").order("name", { ascending: true })
      if (error) throw error
      return (data ?? []) as ProjectOption[]
    },
  })

  const parsedProjectId = view === "project" && projectId ? Number(projectId) : null
  const preferencesQueryKey = ["ai-preferences", parsedProjectId ?? "personal", true]
  const preferencesQuery = useQuery({ queryKey: preferencesQueryKey, enabled: view === "personal" || !!parsedProjectId, queryFn: () => listAiPreferences(parsedProjectId, true) })
  const refresh = () => queryClient.invalidateQueries({ queryKey: preferencesQueryKey })
  const preferences = preferencesQuery.data ?? []
  const createMutation = useMutation({
    mutationFn: () => createAiPreference({ rule: newRule, category: newCategory, scope: view === "personal" ? "user" : newScope, projectId: view === "project" ? parsedProjectId : null }),
    onSuccess: () => { setAdding(false); setNewRule(""); setNewCategory("other"); setNewScope(view === "project" ? "user_project" : "user"); refresh() },
  })
  const openAdd = () => { setAdding(true); setNewScope(view === "project" ? "user_project" : "user") }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div><h2 className="text-lg font-semibold text-gray-950">Learned preferences</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">Articulate learns durable preferences from your feedback and edits. Active preferences can influence future AI replies and artifacts; project knowledge and factual context remain separate.</p></div>
        <Button size="sm" onClick={openAdd} disabled={view === "project" && !parsedProjectId}><Plus className="mr-2 h-4 w-4" />Add preference</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={view === "personal" ? "default" : "outline"} onClick={() => { setView("personal"); setAdding(false) }}>Personal</Button>
        <Button size="sm" variant={view === "project" ? "default" : "outline"} onClick={() => { setView("project"); setAdding(false) }}>Project</Button>
        {view === "project" ? <Select value={projectId} onValueChange={(value) => { setProjectId(value); setAdding(false) }}><SelectTrigger className="w-[260px]"><SelectValue placeholder="Select a project" /></SelectTrigger><SelectContent>{(projectsQuery.data ?? []).map((project) => <SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>)}</SelectContent></Select> : null}
        <Button variant="ghost" size="sm" onClick={() => preferencesQuery.refetch()} disabled={preferencesQuery.isFetching || (view === "project" && !parsedProjectId)}><RotateCcw className={preferencesQuery.isFetching ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />Refresh</Button>
      </div>
      {view === "project" && parsedProjectId ? <p className="text-xs text-gray-400">This view includes global Personal preferences inherited from your profile, Personal preferences for this project, and Shared project preferences.</p> : null}
      {adding ? (
        <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <Input autoFocus value={newRule} onChange={(e) => setNewRule(e.target.value)} maxLength={600} placeholder="e.g. Avoid ‘de forma a’; prefer direct phrasing." disabled={createMutation.isPending} />
          <div className="flex flex-wrap gap-2">
            <Select value={newCategory} onValueChange={(value) => setNewCategory(value as AiPreferenceCategory)}><SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
            {view === "project" ? <Select value={newScope} onValueChange={(value) => setNewScope(value as AiPreferenceScope)}><SelectTrigger className="w-[210px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="user_project">Personal · this project</SelectItem><SelectItem value="project">Shared project</SelectItem></SelectContent></Select> : null}
            <Button size="sm" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || newRule.trim().length < 3 || (view === "project" && !parsedProjectId)}>{createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Add</Button>
            <Button size="sm" variant="outline" onClick={() => setAdding(false)} disabled={createMutation.isPending}>Cancel</Button>
          </div>
          {createMutation.error ? <p className="text-xs text-red-600">{createMutation.error instanceof Error ? createMutation.error.message : "Could not add preference."}</p> : null}
        </div>
      ) : null}
      <div className="border-t border-gray-200">
        {view === "project" && !parsedProjectId ? <p className="py-8 text-sm text-gray-500">Select a project to see personal and shared preferences that apply there.</p>
        : preferencesQuery.isLoading ? <div className="flex items-center gap-2 py-8 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Loading preferences…</div>
        : preferencesQuery.isError ? <p className="py-8 text-sm text-red-600">Could not load learned preferences.</p>
        : preferences.length === 0 ? <p className="py-8 text-sm text-gray-500">No learned preferences yet. They will appear here as Articulate learns from explicit feedback and repeated edits.</p>
        : preferences.map((preference) => <PreferenceRow key={preference.id} preference={preference} currentProjectId={parsedProjectId} onChanged={refresh} />)}
      </div>
      <p className="text-xs leading-5 text-gray-400">Your current instruction always overrides a learned preference. “Forget” stops a preference from being used while retaining its audit history.</p>
    </div>
  )
}
