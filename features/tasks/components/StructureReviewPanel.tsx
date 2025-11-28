"use client"

import React, { useState, useMemo } from "react"
import { Button } from "../../../app/components/ui/button"
import { Label } from "../../../app/components/ui/label"
import { Input } from "../../../app/components/ui/input"
import { Textarea } from "../../../app/components/ui/textarea"
import { Badge } from "../../../app/components/ui/badge"
import { Loader2, AlertCircle, CheckCircle2, Circle, Plus, X, ChevronDown, ChevronRight } from "lucide-react"
import { toast } from "../../../app/components/ui/use-toast"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import ReactMarkdown from 'react-markdown'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../app/components/ui/alert-dialog"

interface TaskChannelComponent {
  task_component_id: string | null
  briefing_component_id: number | null
  project_component_id: number | null
  title: string
  description: string | null
  selected: boolean
  position: number | null
  custom_title: string | null
  custom_description: string | null
  purpose: string | null
  guidance: string | null
  suggested_word_count: number | null
  subheads: any[] | null
  is_ad_hoc?: boolean
  component_scope?: 'task' | 'project' | 'channel'
}

interface StructureReviewPanelProps {
  taskId: number
  existingComponents: TaskChannelComponent[]
  onSuggestionsReceived: (suggestions: SuggestedComponent[]) => void
  onApplyComponent?: (comp: ReviewedComponent) => Promise<void>
  onApplyAll?: (components: ReviewedComponent[]) => Promise<void>
  initialSourceUrl?: string
}

/**
 * Helper to group components by heading level into a hierarchical structure
 */
function groupComponentsByHeadingLevel(components: ReviewedComponent[]): HierComponent[] {
  const result: HierComponent[] = []
  let currentH2: HierComponent | null = null

  for (const comp of components) {
    if (comp.heading_level <= 2) {
      const node: HierComponent = { ...comp, children: [] }
      result.push(node)
      currentH2 = node
    } else {
      if (!currentH2) {
        // No H2 yet → treat as standalone
        result.push({ ...comp, children: [] })
        continue
      }
      currentH2.children!.push(comp)
    }
  }

  return result
}

export type ReviewAction = 'add' | 'improve' | 'remove'

export interface ReviewedComponent {
  title: string
  description: string
  output: string
  selected: boolean
  action: ReviewAction
  source_id: string | null
  heading_level: number
}

export interface TaskStructureReviewResponse {
  task_id: number
  briefing: {
    name: string
    description: string
    content_type: string
  }
  components: ReviewedComponent[]
  global_notes: string
  model_used: string
  tokens_used: number | null
}

// Legacy interface for backward compatibility
export interface SuggestedComponent {
  title: string
  description: string
  output: string
  selected: boolean
  action: ReviewAction
  heading_level?: number
}

// Hierarchical component for tree rendering
export interface HierComponent extends ReviewedComponent {
  children?: ReviewedComponent[]
}

export interface HierarchicalComponent extends SuggestedComponent {
  children?: SuggestedComponent[]
}

export function StructureReviewPanel({ 
  taskId, 
  existingComponents,
  onSuggestionsReceived,
  onApplyComponent,
  onApplyAll,
  initialSourceUrl = ""
}: StructureReviewPanelProps) {
  const supabase = createClientComponentClient()
  
  const [sourceUrls, setSourceUrls] = useState<string[]>(initialSourceUrl ? [initialSourceUrl] : [""])
  const [fileText, setFileText] = useState("")
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reviewData, setReviewData] = useState<TaskStructureReviewResponse | null>(null)
  
  // Update source URLs when initialSourceUrl changes
  React.useEffect(() => {
    if (initialSourceUrl && sourceUrls.length === 1 && !sourceUrls[0]) {
      setSourceUrls([initialSourceUrl])
    }
  }, [initialSourceUrl])
  
  const addSourceUrl = () => {
    setSourceUrls(prev => [...prev, ""])
  }
  
  const removeSourceUrl = (index: number) => {
    if (sourceUrls.length > 1) {
      setSourceUrls(prev => prev.filter((_, i) => i !== index))
    }
  }
  
  const updateSourceUrl = (index: number, value: string) => {
    setSourceUrls(prev => {
      const newUrls = [...prev]
      newUrls[index] = value
      return newUrls
    })
  }

  const handleAnalyze = async () => {
    // Validation - check if any URLs or text provided
    const validUrls = sourceUrls.filter(url => url && url.trim()).map(url => url.trim())
    if (validUrls.length === 0 && !fileText.trim()) {
      setError("Please provide at least one source URL or paste content to analyze")
      return
    }
    
    setError(null)
    setIsAnalyzing(true)
    
    try {
      // Prepare existing components for the API
      const existingComponentsPayload = existingComponents.map(c => ({
        title: c.custom_title || c.title,
        description: c.custom_description || c.description || ''
      }))
      
      // Build request payload
      const payload: any = {
        task_id: taskId,
        existing_components: existingComponentsPayload
      }
      
      // Add source URLs - send as array if multiple, or string if single
      if (validUrls.length === 1) {
        payload.source_url = validUrls[0]
      } else if (validUrls.length > 1) {
        payload.source_url = validUrls
      }
      
      if (fileText.trim()) {
        payload.file_text = fileText.trim()
      }
      
      // Get Supabase session for auth
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error("Not authenticated")
      }
      
      // Call the Edge Function
      const response = await fetch(
        'https://hlszgarnpleikfkwujph.functions.supabase.co/task-structure-review',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify(payload)
        }
      )
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }))
        throw new Error(errorData.error || `API error: ${response.status} ${response.statusText}`)
      }
      
      const result = await response.json()
      
      if (result.error) {
        throw new Error(result.error)
      }
      
      if (!result.components || !Array.isArray(result.components)) {
        throw new Error("Invalid response format: missing components array")
      }
      
      // Store full review data
      setReviewData(result)
      
      // Also pass to parent for backward compatibility
      onSuggestionsReceived(result.components)
      
      toast({
        title: "Analysis complete",
        description: `${result.components.length} component suggestion(s) received. Review them below.`
      })
      
    } catch (err: any) {
      console.error('Structure review failed:', err)
      setError(err.message || 'Failed to analyze content. Please try again.')
      toast({
        title: "Analysis failed",
        description: err.message || 'An error occurred during analysis',
        variant: 'destructive'
      })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false)

  return (
    <div className="border rounded-lg p-4 bg-white space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <button
            onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
            className="flex items-center gap-2 hover:text-gray-700 transition-colors"
          >
            {isPanelCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            <h3 className="font-medium text-gray-900">Structure review (from source)</h3>
          </button>
          {!isPanelCollapsed && reviewData?.briefing && (
            <p className="text-xs text-gray-500 ml-6 mt-1">
              {reviewData.briefing.name} — {reviewData.briefing.description}
            </p>
          )}
          {!isPanelCollapsed && !reviewData && (
            <p className="text-sm text-gray-500 ml-6 mt-1">
              Provide a source URL or paste content to get AI-powered suggestions for improving your task components.
            </p>
          )}
        </div>
      </div>
      
      {!isPanelCollapsed && (
        <>
      
      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm font-medium text-gray-700">
              Source URLs
            </Label>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={addSourceUrl}
              disabled={isAnalyzing}
              className="h-6 px-2 text-xs"
            >
              <Plus className="w-3 h-3 mr-1" />
              Add URL
            </Button>
          </div>
          {sourceUrls.map((url, index) => (
            <div key={index} className="flex items-center gap-2 mb-2">
              <Input
                type="url"
                placeholder="https://example.com/article"
                value={url}
                onChange={(e) => updateSourceUrl(index, e.target.value)}
                disabled={isAnalyzing}
                className="flex-1"
              />
              {sourceUrls.length > 1 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => removeSourceUrl(index)}
                  disabled={isAnalyzing}
                  className="h-9 px-2"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </Button>
              )}
            </div>
          ))}
          <p className="text-xs text-gray-500 mt-1">
            Add one or more URLs to analyze content from webpages
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex-1 border-t border-gray-200"></div>
          <span className="text-xs text-gray-500 uppercase">or</span>
          <div className="flex-1 border-t border-gray-200"></div>
        </div>
        
        <div>
          <Label htmlFor="file-text" className="text-sm font-medium text-gray-700">
            Paste content
          </Label>
          <Textarea
            id="file-text"
            placeholder="Paste document text, outline, or requirements here..."
            value={fileText}
            onChange={(e) => setFileText(e.target.value)}
            disabled={isAnalyzing}
            className="mt-1 min-h-[120px]"
          />
          <p className="text-xs text-gray-500 mt-1">
            Or paste text directly to analyze
          </p>
        </div>
      </div>
      
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
      
      <Button 
        onClick={handleAnalyze}
        disabled={isAnalyzing || (sourceUrls.every(url => !url.trim()) && !fileText.trim())}
        className="w-full"
      >
        {isAnalyzing ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            A analisar...
          </>
        ) : (
          reviewData ? 'Re-analyze' : 'Analisar estrutura'
        )}
      </Button>
      
      {/* Display structured review results */}
      {reviewData && onApplyComponent && onApplyAll && (
        <EnhancedStructureReview
          review={reviewData}
          onApplyComponent={onApplyComponent}
          onApplyAll={onApplyAll}
        />
      )}
      </>
      )}
    </div>
  )
}

/**
 * Enhanced structure review with hierarchical tree and markdown rendering
 */
interface EnhancedStructureReviewProps {
  review: TaskStructureReviewResponse
  onApplyComponent: (comp: ReviewedComponent) => Promise<void>
  onApplyAll: (components: ReviewedComponent[]) => Promise<void>
}

function EnhancedStructureReview({ 
  review, 
  onApplyComponent,
  onApplyAll 
}: EnhancedStructureReviewProps) {
  const [isApplying, setIsApplying] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [appliedComponents, setAppliedComponents] = useState<Set<string>>(new Set())
  
  const selectedComponents = review.components.filter(c => c.selected && c.action !== 'remove')
  
  const handleApplyAll = async () => {
    if (selectedComponents.length === 0) return
    
    setIsApplying(true)
    try {
      await onApplyAll(selectedComponents)
      toast({
        title: "Components added",
        description: `${selectedComponents.length} component(s) added to task briefing`
      })
    } catch (err: any) {
      console.error('Failed to apply all:', err)
      toast({
        title: "Failed to add components",
        description: err.message,
        variant: 'destructive'
      })
    } finally {
      setIsApplying(false)
    }
  }
  
  const handleApplySingle = async (comp: ReviewedComponent) => {
    const key = comp.source_id || comp.title
    await onApplyComponent(comp)
    setAppliedComponents(prev => new Set(prev).add(key))
  }
  
  return (
    <div className="mt-4 space-y-4">
      {/* Header with collapse */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-2 hover:text-gray-700 transition-colors"
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
          <h4 className="font-medium text-gray-900">AI Suggestions ({review.components.length} components)</h4>
        </button>
        
        {/* Apply all button */}
        {!isCollapsed && selectedComponents.length > 0 && (
          <Button
            size="sm"
            onClick={handleApplyAll}
            disabled={isApplying}
          >
            {isApplying ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              `Adicionar todas as secções selecionadas (${selectedComponents.length})`
            )}
          </Button>
        )}
      </div>
      
      {!isCollapsed && (
        <>
          {/* Hierarchical tree */}
          <StructureTree
            components={review.components}
            onApplyComponent={handleApplySingle}
            appliedComponents={appliedComponents}
          />
      
          {/* Global notes */}
          {review.global_notes && (
            <div className="mt-3 p-3 bg-gray-50 rounded-md border">
              <div className="text-xs font-semibold text-gray-700 mb-1">Notas globais</div>
              <p className="text-xs text-gray-600 whitespace-pre-wrap">{review.global_notes}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/**
 * Tree structure for hierarchical display
 */
interface StructureTreeProps {
  components: ReviewedComponent[]
  onApplyComponent: (comp: ReviewedComponent) => Promise<void>
  appliedComponents: Set<string>
}

function StructureTree({ components, onApplyComponent, appliedComponents }: StructureTreeProps) {
  const grouped = useMemo(() => groupComponentsByHeadingLevel(components), [components])
  
  return (
    <div className="flex flex-col gap-2">
      {grouped.map((node, index) => (
        <SectionNode
          key={`${node.source_id ?? node.title}-${index}`}
          node={node}
          nodeIndex={index}
          onApplyComponent={onApplyComponent}
          appliedComponents={appliedComponents}
        />
      ))}
    </div>
  )
}

/**
 * Individual section node with collapsible children
 */
interface SectionNodeProps {
  node: HierComponent
  nodeIndex: number
  onApplyComponent: (comp: ReviewedComponent) => Promise<void>
  appliedComponents: Set<string>
  depth?: number
}

function SectionNode({ node, nodeIndex, onApplyComponent, appliedComponents, depth = 0 }: SectionNodeProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [isApplying, setIsApplying] = useState(false)
  const componentKey = node.source_id || node.title
  const isApplied = appliedComponents.has(componentKey)
  
  const pillColor =
    node.action === 'add'
      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
      : node.action === 'remove'
      ? 'bg-red-50 text-red-700 border border-red-200'
      : 'bg-blue-50 text-blue-700 border border-blue-200'
  
  const handleApply = async () => {
    setIsApplying(true)
    try {
      await onApplyComponent(node)
      toast({
        title: "Component added",
        description: `"${node.title}" added to task briefing`
      })
    } catch (err: any) {
      console.error('Failed to apply component:', err)
      toast({
        title: "Failed to add component",
        description: err.message,
        variant: 'destructive'
      })
    } finally {
      setIsApplying(false)
    }
  }
  
  // Calculate indentation for nested items (using inline style for dynamic values)
  const indentStyle = depth > 0 ? { marginLeft: `${Math.min(depth * 24, 48)}px` } : undefined
  
  return (
    <div className="border rounded-lg bg-white" style={indentStyle}>
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs text-gray-500 font-mono flex-shrink-0">
            H{node.heading_level ?? 2}
          </span>
          <span className="font-medium text-sm truncate">{node.title}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 ${pillColor}`}>
            {node.action.toUpperCase()}
          </span>
        </div>
        <div className="flex-shrink-0 ml-2">
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>
      
      {/* Expanded content */}
      {isOpen && (
        <div className="px-3 pb-3 flex flex-col gap-3 border-t">
          {/* Instructions (description) */}
          <div className="mt-3">
            <div className="text-[11px] font-semibold text-gray-700 mb-1">
              Instruções
            </div>
            <p className="text-xs text-gray-600 whitespace-pre-wrap">
              {node.description || '---'}
            </p>
          </div>
          
          {/* Original content (output) - rendered as markdown */}
          {node.output && (
            <div>
              <div className="text-[11px] font-semibold text-gray-700 mb-1">
                Conteúdo atual
              </div>
              <div 
                className="border rounded-md p-3 overflow-auto bg-white resize-y prose prose-sm max-w-none text-xs prose-img:max-w-full prose-img:max-h-96 prose-img:object-contain"
                style={{ minHeight: '120px', maxHeight: '600px', height: '240px' }}
              >
                <ReactMarkdown>
                  {node.output}
                </ReactMarkdown>
              </div>
            </div>
          )}
          
          {/* Children (H3, H4, etc.) */}
          {node.children && node.children.length > 0 && (
            <div className="ml-6 border-l-2 border-gray-200 pl-4 flex flex-col gap-2">
              {node.children.map((child, childIndex) => (
                <SectionNode
                  key={`${child.source_id ?? child.title}-${nodeIndex}-${childIndex}`}
                  node={child as HierComponent}
                  nodeIndex={childIndex}
                  onApplyComponent={onApplyComponent}
                  appliedComponents={appliedComponents}
                  depth={depth + 1}
                />
              ))}
            </div>
          )}
          
          {/* Apply button */}
          {node.action !== 'remove' && (
            <div className="flex justify-end pt-2 border-t">
              <Button
                size="sm"
                variant={isApplied ? "secondary" : "outline"}
                onClick={handleApply}
                disabled={isApplying || isApplied}
              >
                {isApplying ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : isApplied ? (
                  'Added'
                ) : (
                  'Adicionar esta secção'
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Component to display suggested components in an editable format (LEGACY)
 */
interface SuggestedComponentsListProps {
  suggestions: SuggestedComponent[]
  onUpdateSuggestion: (index: number, updated: Partial<SuggestedComponent>) => void
  onAddComponent: (component: SuggestedComponent, index: number) => Promise<void>
  onAddAllSelected: (components: SuggestedComponent[]) => Promise<void>
}

// Helper function to group components by heading level
function groupByHeadingLevel(components: SuggestedComponent[]): HierarchicalComponent[] {
  const result: HierarchicalComponent[] = []
  let currentH2: HierarchicalComponent | null = null
  
  for (const comp of components) {
    if ((comp.heading_level ?? 0) <= 2) {
      const node: HierarchicalComponent = { ...comp, children: [] }
      result.push(node)
      currentH2 = node
    } else {
      if (!currentH2) {
        result.push({ ...comp, children: [] })
        continue
      }
      currentH2.children!.push(comp)
    }
  }
  
  return result
}

// Helper to get indentation based on heading level
function getIndentClass(level: number): string {
  if (level <= 2) return ''
  if (level === 3) return 'ml-6 border-l-2 border-gray-200 pl-4'
  return 'ml-12 border-l-2 border-gray-300 pl-4'
}

export function SuggestedComponentsList({ 
  suggestions,
  onUpdateSuggestion,
  onAddComponent,
  onAddAllSelected
}: SuggestedComponentsListProps) {
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set())
  const [expandedComponents, setExpandedComponents] = useState<Set<number>>(new Set())
  const [isAddingComponent, setIsAddingComponent] = useState<number | null>(null)
  const [addedComponents, setAddedComponents] = useState<Set<number>>(new Set())
  const [showAddAllDialog, setShowAddAllDialog] = useState(false)
  const [isAddingAll, setIsAddingAll] = useState(false)
  
  if (suggestions.length === 0) {
    return null
  }
  
  // Group components hierarchically
  const hierarchicalComponents = groupByHeadingLevel(suggestions)
  
  // Get selected components that aren't marked for removal
  const selectedForAdding = suggestions.filter(s => s.selected && s.action !== 'remove')
  
  // Helper to get badge variant and label for action type
  const getActionBadge = (action: 'improve' | 'add' | 'remove') => {
    switch (action) {
      case 'improve':
        return { variant: 'default' as const, label: 'IMPROVE', color: 'bg-blue-100 text-blue-800' }
      case 'add':
        return { variant: 'default' as const, label: 'ADD', color: 'bg-green-100 text-green-800' }
      case 'remove':
        return { variant: 'default' as const, label: 'REMOVE', color: 'bg-red-100 text-red-800' }
    }
  }
  
  const toggleSection = (index: number) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }
  
  const toggleComponentExpand = (index: number) => {
    setExpandedComponents(prev => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }
  
  const handleAddComponent = async (component: SuggestedComponent, originalIndex: number) => {
    setIsAddingComponent(originalIndex)
    try {
      await onAddComponent(component, originalIndex)
      setAddedComponents(prev => new Set(prev).add(originalIndex))
      toast({
        title: "Component added",
        description: `"${component.title}" has been added to your task components.`
      })
    } catch (err: any) {
      toast({
        title: "Failed to add component",
        description: err.message || "An error occurred",
        variant: "destructive"
      })
    } finally {
      setIsAddingComponent(null)
    }
  }
  
  const handleAddAllSelected = async () => {
    setIsAddingAll(true)
    try {
      await onAddAllSelected(selectedForAdding)
      toast({
        title: "Components added",
        description: `${selectedForAdding.length} component(s) have been added to your task.`
      })
      setShowAddAllDialog(false)
    } catch (err: any) {
      toast({
        title: "Failed to add components",
        description: err.message || "An error occurred",
        variant: "destructive"
      })
    } finally {
      setIsAddingAll(false)
    }
  }
  
  // Initialize all H2 sections as expanded
  React.useEffect(() => {
    const h2Indices = new Set<number>()
    hierarchicalComponents.forEach((comp, idx) => {
      if ((comp.heading_level ?? 0) <= 2) {
        h2Indices.add(idx)
      }
    })
    setExpandedSections(h2Indices)
  }, [suggestions])
  
  // Render a single component (used for both parent and child components)
  const renderComponent = (component: SuggestedComponent, originalIndex: number, isChild: boolean = false) => {
    const isExpanded = expandedComponents.has(originalIndex)
    const indentClass = isChild ? getIndentClass(component.heading_level ?? 0) : ''
    const isAdded = addedComponents.has(originalIndex)
    const isAdding = isAddingComponent === originalIndex
    
    return (
      <div key={originalIndex} className={`border rounded-lg ${component.selected ? 'bg-white' : 'bg-gray-50'} ${isChild ? indentClass : ''}`}>
        {/* Collapsed view */}
        {!isExpanded ? (
          <div className="flex items-center gap-2 p-3">
            <button
              type="button"
              onClick={() => onUpdateSuggestion(originalIndex, { selected: !component.selected })}
            >
              {component.selected ? (
                <CheckCircle2 className="w-5 h-5 text-blue-600" />
              ) : (
                <Circle className="w-5 h-5 text-gray-300" />
              )}
            </button>
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <Badge className={`${getActionBadge(component.action).color} text-xs px-2 py-0.5 flex-shrink-0`}>
                {getActionBadge(component.action).label}
              </Badge>
              <h4 className={`text-sm font-medium truncate ${component.selected ? 'text-gray-900' : 'text-gray-700'}`}>
                {component.title}
              </h4>
            </div>
            <Button
              size="sm"
              variant={isAdded ? "secondary" : "outline"}
              onClick={() => handleAddComponent(component, originalIndex)}
              disabled={isAdding || isAdded || component.action === 'remove'}
              className="flex-shrink-0"
            >
              {isAdding ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Adding...
                </>
              ) : isAdded ? (
                'Added'
              ) : (
                'Add to task'
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => toggleComponentExpand(originalIndex)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          /* Expanded view */
          <div className="p-3 space-y-3">
            <div className="flex items-center gap-2 pb-3 border-b">
              <button
                type="button"
                onClick={() => onUpdateSuggestion(originalIndex, { selected: !component.selected })}
              >
                {component.selected ? (
                  <CheckCircle2 className="w-5 h-5 text-blue-600" />
                ) : (
                  <Circle className="w-5 h-5 text-gray-300" />
                )}
              </button>
              <Badge className={`${getActionBadge(component.action).color} text-xs px-2 py-0.5 flex-shrink-0`}>
                {getActionBadge(component.action).label}
              </Badge>
              <Input
                value={component.title}
                onChange={(e) => onUpdateSuggestion(originalIndex, { title: e.target.value })}
                className="flex-1 text-sm font-medium"
                placeholder="Component title"
              />
              <Button
                size="sm"
                variant={isAdded ? "secondary" : "outline"}
                onClick={() => handleAddComponent(component, originalIndex)}
                disabled={isAdding || isAdded || component.action === 'remove'}
                className="flex-shrink-0"
              >
                {isAdding ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Adding...
                  </>
                ) : isAdded ? (
                  'Added'
                ) : (
                  'Add to task'
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => toggleComponentExpand(originalIndex)}
              >
                <ChevronDown className="w-4 h-4" />
              </Button>
            </div>
            
            <div>
              <Label className="text-xs font-medium text-gray-700">Instructions / Rationale</Label>
              <Textarea
                value={component.description}
                onChange={(e) => onUpdateSuggestion(originalIndex, { description: e.target.value })}
                className="mt-1 min-h-[80px] text-xs"
                placeholder="Component description and instructions"
              />
            </div>
            
            {component.output && (
              <div>
                <Label className="text-xs font-medium text-gray-700">Original Content</Label>
                <div 
                  className="mt-1 border rounded-md p-3 overflow-auto bg-white resize-y"
                  style={{ minHeight: '120px', maxHeight: '600px', height: '240px' }}
                >
                  <div className="prose prose-sm max-w-none text-xs prose-img:max-w-full prose-img:max-h-96 prose-img:object-contain">
                    <ReactMarkdown>
                      {component.output}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }
  
  return (
    <>
      <div className="border rounded-lg p-4 bg-white space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-gray-900 mb-1">AI Suggestions</h3>
            <p className="text-sm text-gray-500">
              Review the suggested structure. Click "Add to task" to include components in your briefing.
            </p>
          </div>
          {selectedForAdding.length > 0 && (
            <Button
              onClick={() => setShowAddAllDialog(true)}
              disabled={isAddingAll}
              variant="default"
            >
              {isAddingAll ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Add all selected ({selectedForAdding.length})
            </Button>
          )}
        </div>
        
        {/* Hierarchical component rendering */}
        <div className="space-y-3">
          {hierarchicalComponents.map((section, sectionIdx) => {
            const originalSectionIndex = suggestions.indexOf(section)
            const isSectionExpanded = expandedSections.has(sectionIdx)
            const isH2 = (section.heading_level ?? 0) <= 2
            
            return (
              <div key={sectionIdx} className="space-y-2">
                {/* H2 Section Header with collapse toggle */}
                {isH2 && section.children && section.children.length > 0 ? (
                  <div className="space-y-2">
                    {/* Parent H2 component */}
                    <div className="border-l-4 border-blue-500 pl-2">
                      {renderComponent(section, originalSectionIndex, false)}
                    </div>
                    
                    {/* Toggle button for children */}
                    <button
                      onClick={() => toggleSection(sectionIdx)}
                      className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 ml-6"
                    >
                      {isSectionExpanded ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                      {isSectionExpanded ? 'Hide' : 'Show'} {section.children.length} subsection{section.children.length !== 1 ? 's' : ''}
                    </button>
                    
                    {/* Child components (H3+) */}
                    {isSectionExpanded && (
                      <div className="space-y-2">
                        {section.children.map((child) => {
                          const originalChildIndex = suggestions.indexOf(child)
                          return renderComponent(child, originalChildIndex, true)
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Standalone component (no children) */
                  renderComponent(section, originalSectionIndex, false)
                )}
              </div>
            )
          })}
        </div>
        
        <div className="pt-2 border-t">
          <p className="text-xs text-gray-500">
            💡 Tip: These are AI suggestions based on the analyzed content. Review and edit before adding to your task components.
          </p>
        </div>
      </div>
      
      {/* Confirmation dialog for adding all */}
      <AlertDialog open={showAddAllDialog} onOpenChange={setShowAddAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add all selected components?</AlertDialogTitle>
            <AlertDialogDescription>
              This will add {selectedForAdding.length} component{selectedForAdding.length !== 1 ? 's' : ''} to your task's component list for the current channel.
              You can edit or remove them afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isAddingAll}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleAddAllSelected} disabled={isAddingAll}>
              {isAddingAll ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add components'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

