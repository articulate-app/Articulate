"use client"

import * as React from 'react'
import { useState, useMemo, useCallback } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { Label } from '../ui/label'
import { Badge } from '../ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { GripVertical, ChevronDown, ChevronRight, Trash2, AlertCircle, Info } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import debounce from 'lodash.debounce'
import { addProjectComponentToBriefing } from '../../lib/services/project-briefings'

interface BriefingOutlineItem {
  label: string
  purpose: string
  guidance: string
  suggested_word_count: number | null
  subheads: Array<{ label: string; guidance: string }>
}

interface BriefingConstraints {
  tone: string
  audience: string
  length: string
  seo: {
    meta_title_pattern: string
    meta_description_pattern: string
  } | null
  assets: {
    required: string[]
    optional: string[]
  } | null
  cta: string
}

export interface ImportedBriefingData {
  project_id: number
  briefing: {
    name: string
    description: string
    content_type: string
  }
  outline: BriefingOutlineItem[]
  constraints: BriefingConstraints
  model_used?: string
  tokens_used?: number | null
}

export interface OutlineItemResolution {
  action: 'new' | 'reuse' | 'skip'
  projectComponentId?: number
  resolvedLabel?: string
}

interface OutlineItemValidation {
  inProject: boolean
  inBriefing: boolean
  duplicateInBatch: boolean
  projectComponentId?: number
}

interface ImportReviewModalProps {
  briefingData: ImportedBriefingData | null
  projectId: number
  briefingTypeId: number | null
  projectLibrary: Array<{ id: number; title: string }> | null
  briefingComponents: Array<{ component_id: number; effective_title: string; source: 'global' | 'project' }> | null
  onBriefingDataChange: (data: ImportedBriefingData | null) => void
  onConfirm: (resolutions: Map<number, OutlineItemResolution>) => Promise<void>
  onCancel: () => void
}

// Normalization function
const normalizeTitle = (s: string): string => {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

function SortableOutlineItem({
  item,
  index,
  validation,
  resolution,
  onUpdate,
  onRemove,
  onResolutionChange,
}: {
  item: BriefingOutlineItem
  index: number
  validation: OutlineItemValidation
  resolution: OutlineItemResolution | null
  onUpdate: (item: BriefingOutlineItem) => void
  onRemove: () => void
  onResolutionChange: (resolution: OutlineItemResolution) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: index,
  })

  const [isExpanded, setIsExpanded] = useState(false)
  const [label, setLabel] = useState(item.label)
  const [purpose, setPurpose] = useState(item.purpose)
  const [guidance, setGuidance] = useState(item.guidance)
  const [suggestedWordCount, setSuggestedWordCount] = useState(item.suggested_word_count?.toString() || '')
  const [subheads, setSubheads] = useState(item.subheads)
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [localResolution, setLocalResolution] = useState<OutlineItemResolution | null>(resolution)

  React.useEffect(() => {
    setLabel(item.label)
    setPurpose(item.purpose)
    setGuidance(item.guidance)
    setSuggestedWordCount(item.suggested_word_count?.toString() || '')
    setSubheads(item.subheads)
  }, [item])

  React.useEffect(() => {
    setLocalResolution(resolution)
  }, [resolution])

  const debouncedUpdate = useMemo(
    () => debounce((updated: BriefingOutlineItem) => {
      onUpdate(updated)
    }, 200),
    [onUpdate]
  )

  const handleLabelChange = (newLabel: string) => {
    setLabel(newLabel)
    debouncedUpdate({
      label: newLabel,
      purpose,
      guidance,
      suggested_word_count: suggestedWordCount ? parseInt(suggestedWordCount, 10) : null,
      subheads,
    })
  }

  const handleBlur = () => {
    setIsEditingLabel(false)
    onUpdate({
      label,
      purpose,
      guidance,
      suggested_word_count: suggestedWordCount ? parseInt(suggestedWordCount, 10) : null,
      subheads,
    })
  }

  const handleSubheadUpdate = (subheadIndex: number, updates: { label?: string; guidance?: string }) => {
    const updated = [...subheads]
    updated[subheadIndex] = { ...updated[subheadIndex], ...updates }
    setSubheads(updated)
    onUpdate({
      label,
      purpose,
      guidance,
      suggested_word_count: suggestedWordCount ? parseInt(suggestedWordCount, 10) : null,
      subheads: updated,
    })
  }

  const handleResolutionChange = (action: 'new' | 'reuse' | 'skip') => {
    const newResolution: OutlineItemResolution = {
      action,
      projectComponentId: action === 'reuse' && validation.projectComponentId ? validation.projectComponentId : undefined,
      resolvedLabel: action !== 'skip' ? label : undefined,
    }
    setLocalResolution(newResolution)
    onResolutionChange(newResolution)
  }

  const hasConflict = validation.inProject || validation.inBriefing || validation.duplicateInBatch
  const isResolved = localResolution !== null && (
    localResolution.action === 'skip' ||
    (localResolution.action === 'reuse' && validation.inProject && !validation.inBriefing) ||
    (localResolution.action === 'new' && !hasConflict)
  )

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    borderColor: hasConflict && !isResolved ? '#ef4444' : undefined,
    borderWidth: hasConflict && !isResolved ? 2 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border rounded-lg p-4 bg-white ${hasConflict && !isResolved ? 'border-red-500' : 'border-gray-200'}`}
    >
      <div className="flex items-start gap-3">
        <div {...attributes} {...listeners} className="cursor-move p-1 hover:bg-gray-200 rounded mt-1">
          <GripVertical className="w-4 h-4 text-gray-400" />
        </div>
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-500">{index + 1}.</span>
            <div className="flex-1 min-w-[200px]">
              <Input
                value={label}
                onChange={(e) => {
                  handleLabelChange(e.target.value)
                  setIsEditingLabel(true)
                }}
                onBlur={handleBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur()
                  } else if (e.key === 'Escape') {
                    setLabel(item.label)
                    setIsEditingLabel(false)
                  }
                }}
                placeholder="Section label"
                className="font-semibold"
                maxLength={120}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-gray-600 whitespace-nowrap">Word count:</Label>
              <Input
                type="number"
                value={suggestedWordCount}
                onChange={(e) => setSuggestedWordCount(e.target.value)}
                onBlur={handleBlur}
                className="w-20 text-sm"
                placeholder="Optional"
              />
            </div>
          </div>

          {/* Validation Badges */}
          {hasConflict && (
            <div className="flex items-center gap-2 flex-wrap">
              {validation.inBriefing && (
                <Badge variant="destructive" className="text-xs">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Already in this briefing
                </Badge>
              )}
              {validation.inProject && !validation.inBriefing && (
                <Badge variant="secondary" className="text-xs">
                  <Info className="w-3 h-3 mr-1" />
                  Already in project library
                </Badge>
              )}
              {validation.duplicateInBatch && (
                <Badge variant="destructive" className="text-xs">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Duplicate in import
                </Badge>
              )}
            </div>
          )}

          {/* Resolution Dropdown */}
          {hasConflict && (
            <div className="flex items-center gap-2">
              <Label className="text-xs text-gray-600 whitespace-nowrap">Resolution:</Label>
              <Select
                value={localResolution?.action || 'new'}
                onValueChange={(value) => handleResolutionChange(value as 'new' | 'reuse' | 'skip')}
              >
                <SelectTrigger className="w-[200px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {validation.inProject && !validation.inBriefing && (
                    <SelectItem value="reuse">Reuse existing component</SelectItem>
                  )}
                  {validation.inBriefing && (
                    <>
                      <SelectItem value="skip">Skip adding</SelectItem>
                      <SelectItem value="new">Rename (new component)</SelectItem>
                    </>
                  )}
                  {validation.duplicateInBatch && !validation.inBriefing && (
                    <SelectItem value="new">Rename (required)</SelectItem>
                  )}
                  {!validation.inBriefing && !validation.duplicateInBatch && validation.inProject && (
                    <SelectItem value="new">Create new component</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="text-xs text-gray-600 mb-1 block">Purpose</Label>
            <Textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              onBlur={handleBlur}
              placeholder="Section purpose"
              rows={2}
              className="text-sm"
              maxLength={400}
            />
          </div>
          <div>
            <Label className="text-xs text-gray-600 mb-1 block">Guidance</Label>
            <Textarea
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              onBlur={handleBlur}
              placeholder="Section guidance"
              rows={2}
              className="text-sm"
              maxLength={800}
            />
          </div>
          {subheads.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-2"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <span>Subheads ({subheads.length})</span>
              </button>
              {isExpanded && (
                <div className="pl-4 border-l-2 border-gray-200 space-y-2">
                  {subheads.map((subhead, subheadIndex) => (
                    <div key={subheadIndex} className="bg-gray-50 p-3 rounded">
                      <Input
                        value={subhead.label}
                        onChange={(e) => handleSubheadUpdate(subheadIndex, { label: e.target.value })}
                        placeholder="Subhead label"
                        className="text-sm font-medium mb-2"
                        maxLength={120}
                      />
                      <Textarea
                        value={subhead.guidance}
                        onChange={(e) => handleSubheadUpdate(subheadIndex, { guidance: e.target.value })}
                        placeholder="Subhead guidance"
                        rows={1}
                        className="text-xs"
                        maxLength={600}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="p-1 rounded hover:bg-red-50 text-red-500 mt-1"
          title="Remove component"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export function ImportReviewModal({
  briefingData,
  projectId,
  briefingTypeId,
  projectLibrary,
  briefingComponents,
  onBriefingDataChange,
  onConfirm,
  onCancel,
}: ImportReviewModalProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const [briefing, setBriefing] = useState(briefingData?.briefing || { name: '', description: '', content_type: '' })
  const [outline, setOutline] = useState(briefingData?.outline || [])
  const [constraints, setConstraints] = useState(briefingData?.constraints || {
    tone: '',
    audience: '',
    length: '',
    seo: null,
    assets: null,
    cta: '',
  })
  const [resolutions, setResolutions] = useState<Map<number, OutlineItemResolution>>(new Map())

  React.useEffect(() => {
    if (briefingData) {
      setBriefing(briefingData.briefing)
      setOutline(briefingData.outline)
      setConstraints(briefingData.constraints)
      setResolutions(new Map())
    }
  }, [briefingData])

  // Build normalized title sets
  const projectTitles = useMemo(() => {
    const map = new Map<string, number>()
    if (projectLibrary) {
      for (const r of projectLibrary) {
        map.set(normalizeTitle(r.title), r.id)
      }
    }
    return map
  }, [projectLibrary])

  const briefingTitles = useMemo(() => {
    const set = new Set<string>()
    if (briefingComponents) {
      for (const r of briefingComponents) {
        set.add(normalizeTitle(r.effective_title))
      }
    }
    return set
  }, [briefingComponents])

  // Validate each outline item
  const validations = useMemo(() => {
    const validationsMap = new Map<number, OutlineItemValidation>()
    const labelCounts = new Map<string, number[]>()

    // Count occurrences of each normalized label
    outline.forEach((item, index) => {
      const normLabel = normalizeTitle(item.label)
      if (!labelCounts.has(normLabel)) {
        labelCounts.set(normLabel, [])
      }
      labelCounts.get(normLabel)!.push(index)
    })

    outline.forEach((item, index) => {
      const normLabel = normalizeTitle(item.label)
      validationsMap.set(index, {
        inProject: projectTitles.has(normLabel),
        inBriefing: briefingTitles.has(normLabel),
        duplicateInBatch: (labelCounts.get(normLabel) || []).length > 1,
        projectComponentId: projectTitles.get(normLabel),
      })
    })

    return validationsMap
  }, [outline, projectTitles, briefingTitles])

  // Check if all conflicts are resolved
  const allResolved = useMemo(() => {
    for (let i = 0; i < outline.length; i++) {
      const validation = validations.get(i)
      if (!validation) continue

      const hasConflict = validation.inProject || validation.inBriefing || validation.duplicateInBatch
      if (!hasConflict) continue

      const resolution = resolutions.get(i)
      if (!resolution) return false

      const isResolved =
        resolution.action === 'skip' ||
        (resolution.action === 'reuse' && validation.inProject && !validation.inBriefing) ||
        (resolution.action === 'new' && !validation.duplicateInBatch && !validation.inBriefing)

      if (!isResolved) return false
    }
    return true
  }, [outline, validations, resolutions])

  // Calculate summary stats
  const summary = useMemo(() => {
    let newCount = 0
    let reuseCount = 0
    let skipCount = 0

    for (let i = 0; i < outline.length; i++) {
      const resolution = resolutions.get(i)
      const validation = validations.get(i)
      
      if (resolution?.action === 'skip') {
        skipCount++
      } else if (resolution?.action === 'reuse' || (validation?.inProject && !validation?.inBriefing && !resolution)) {
        reuseCount++
      } else {
        newCount++
      }
    }

    return { new: newCount, reuse: reuseCount, skip: skipCount }
  }, [outline, resolutions, validations])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id || !briefingData) return

    const oldIndex = active.id as number
    const newIndex = over.id as number

    const reordered = arrayMove(outline, oldIndex, newIndex)
    setOutline(reordered)
    
    // Reorder resolutions
    const newResolutions = new Map<number, OutlineItemResolution>()
    resolutions.forEach((resolution, oldIdx) => {
      if (oldIdx === oldIndex) {
        newResolutions.set(newIndex, resolution)
      } else if (oldIdx === newIndex) {
        newResolutions.set(oldIndex, resolution)
      } else if (oldIdx < oldIndex && oldIdx < newIndex) {
        newResolutions.set(oldIdx, resolution)
      } else if (oldIdx > oldIndex && oldIdx > newIndex) {
        newResolutions.set(oldIdx, resolution)
      } else if (oldIdx > oldIndex) {
        newResolutions.set(oldIdx - 1, resolution)
      } else if (oldIdx < oldIndex) {
        newResolutions.set(oldIdx + 1, resolution)
      }
    })
    setResolutions(newResolutions)

    onBriefingDataChange({
      ...briefingData,
      outline: reordered,
    })
  }

  const handleOutlineUpdate = (index: number, updated: BriefingOutlineItem) => {
    const updatedOutline = [...outline]
    updatedOutline[index] = updated
    setOutline(updatedOutline)
    if (briefingData) {
      onBriefingDataChange({
        ...briefingData,
        outline: updatedOutline,
      })
    }
  }

  const handleOutlineRemove = (index: number) => {
    const filteredOutline = outline.filter((_, idx) => idx !== index)
    setOutline(filteredOutline)
    
    // Remove resolution for this index
    const newResolutions = new Map<number, OutlineItemResolution>()
    resolutions.forEach((resolution, idx) => {
      if (idx < index) {
        newResolutions.set(idx, resolution)
      } else if (idx > index) {
        newResolutions.set(idx - 1, resolution)
      }
    })
    setResolutions(newResolutions)

    if (briefingData) {
      onBriefingDataChange({
        ...briefingData,
        outline: filteredOutline,
      })
    }
  }

  const handleResolutionChange = (index: number, resolution: OutlineItemResolution) => {
    const newResolutions = new Map(resolutions)
    newResolutions.set(index, resolution)
    setResolutions(newResolutions)
  }

  if (!briefingData) {
    return (
      <div className="text-center py-8 text-gray-500">
        No briefing data to review
      </div>
    )
  }

  const hasConflicts = Array.from(validations.values()).some(
    v => v.inProject || v.inBriefing || v.duplicateInBatch
  )

  return (
    <div className="space-y-6">
      {/* Briefing Header */}
      <div className="border rounded-lg p-4 bg-white border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Briefing</h3>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-gray-600 mb-1 block">Name</Label>
            <Input
              value={briefing.name}
              onChange={(e) => {
                const updated = { ...briefing, name: e.target.value }
                setBriefing(updated)
                onBriefingDataChange({
                  ...briefingData,
                  briefing: updated,
                })
              }}
              placeholder="Briefing name"
              className="font-semibold"
              maxLength={120}
            />
          </div>
          <div>
            <Label className="text-xs text-gray-600 mb-1 block">Description</Label>
            <Textarea
              value={briefing.description}
              onChange={(e) => {
                const updated = { ...briefing, description: e.target.value }
                setBriefing(updated)
                onBriefingDataChange({
                  ...briefingData,
                  briefing: updated,
                })
              }}
              placeholder="Briefing description"
              rows={2}
              maxLength={500}
            />
          </div>
        </div>
      </div>

      {/* Outline */}
      <div className="border rounded-lg p-4 bg-white border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Outline</h3>
        {hasConflicts && !allResolved && (
          <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
            Please resolve all conflicts before saving. Use the resolution dropdown for each item.
          </div>
        )}
        <div className="space-y-3 max-h-[40vh] overflow-y-auto">
          {outline.length === 0 ? (
            <div className="text-center py-4 text-gray-500 text-sm">No outline items</div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={outline.map((_, i) => i)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {outline.map((item, index) => (
                    <SortableOutlineItem
                      key={index}
                      item={item}
                      index={index}
                      validation={validations.get(index) || { inProject: false, inBriefing: false, duplicateInBatch: false }}
                      resolution={resolutions.get(index) || null}
                      onUpdate={(updated) => handleOutlineUpdate(index, updated)}
                      onRemove={() => handleOutlineRemove(index)}
                      onResolutionChange={(resolution) => handleResolutionChange(index, resolution)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      {/* Constraints */}
      <div className="border rounded-lg p-4 bg-white border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Constraints</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Tone</Label>
              <Input
                value={constraints.tone}
                onChange={(e) => {
                  const updated = { ...constraints, tone: e.target.value }
                  setConstraints(updated)
                  onBriefingDataChange({
                    ...briefingData,
                    constraints: updated,
                  })
                }}
                placeholder="Tone"
                maxLength={200}
              />
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Audience</Label>
              <Input
                value={constraints.audience}
                onChange={(e) => {
                  const updated = { ...constraints, audience: e.target.value }
                  setConstraints(updated)
                  onBriefingDataChange({
                    ...briefingData,
                    constraints: updated,
                  })
                }}
                placeholder="Audience"
                maxLength={200}
              />
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Length</Label>
              <Input
                value={constraints.length}
                onChange={(e) => {
                  const updated = { ...constraints, length: e.target.value }
                  setConstraints(updated)
                  onBriefingDataChange({
                    ...briefingData,
                    constraints: updated,
                  })
                }}
                placeholder="Length"
                maxLength={100}
              />
            </div>
          </div>

          {constraints.seo && (
            <div className="border-t pt-3">
              <Label className="text-xs font-semibold text-gray-700 mb-2 block">SEO</Label>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs text-gray-600 mb-1 block">Meta Title Pattern</Label>
                  <Input
                    value={constraints.seo.meta_title_pattern}
                    onChange={(e) => {
                      const updated = {
                        ...constraints,
                        seo: { ...constraints.seo!, meta_title_pattern: e.target.value },
                      }
                      setConstraints(updated)
                      onBriefingDataChange({
                        ...briefingData,
                        constraints: updated,
                      })
                    }}
                    placeholder="Meta title pattern"
                    maxLength={120}
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-600 mb-1 block">Meta Description Pattern</Label>
                  <Input
                    value={constraints.seo.meta_description_pattern}
                    onChange={(e) => {
                      const updated = {
                        ...constraints,
                        seo: { ...constraints.seo!, meta_description_pattern: e.target.value },
                      }
                      setConstraints(updated)
                      onBriefingDataChange({
                        ...briefingData,
                        constraints: updated,
                      })
                    }}
                    placeholder="Meta description pattern"
                    maxLength={200}
                  />
                </div>
              </div>
            </div>
          )}

          {constraints.assets && (
            <div className="border-t pt-3">
              <Label className="text-xs font-semibold text-gray-700 mb-2 block">Assets</Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-gray-600 mb-1 block">Required</Label>
                  <Input
                    value={constraints.assets.required.join(', ')}
                    onChange={(e) => {
                      const assets = e.target.value.split(',').map(a => a.trim()).filter(Boolean)
                      const updated = {
                        ...constraints,
                        assets: { ...constraints.assets!, required: assets },
                      }
                      setConstraints(updated)
                      onBriefingDataChange({
                        ...briefingData,
                        constraints: updated,
                      })
                    }}
                    placeholder="Required assets (comma-separated)"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-600 mb-1 block">Optional</Label>
                  <Input
                    value={constraints.assets.optional.join(', ')}
                    onChange={(e) => {
                      const assets = e.target.value.split(',').map(a => a.trim()).filter(Boolean)
                      const updated = {
                        ...constraints,
                        assets: { ...constraints.assets!, optional: assets },
                      }
                      setConstraints(updated)
                      onBriefingDataChange({
                        ...briefingData,
                        constraints: updated,
                      })
                    }}
                    placeholder="Optional assets (comma-separated)"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="border-t pt-3">
            <Label className="text-xs text-gray-600 mb-1 block">CTA</Label>
            <Input
              value={constraints.cta}
              onChange={(e) => {
                const updated = { ...constraints, cta: e.target.value }
                setConstraints(updated)
                onBriefingDataChange({
                  ...briefingData,
                  constraints: updated,
                })
              }}
              placeholder="Call to action"
              maxLength={200}
            />
          </div>
        </div>
      </div>

      {/* Summary */}
      {hasConflicts && (
        <div className="border rounded-lg p-3 bg-gray-50 border-gray-200">
          <div className="text-xs font-semibold text-gray-700 mb-2">Summary</div>
          <div className="text-xs text-gray-600">
            {summary.new} new, {summary.reuse} reused, {summary.skip} skipped
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button 
          onClick={() => onConfirm(resolutions)} 
          disabled={outline.length === 0 || (hasConflicts && !allResolved)}
        >
          Confirm & Save to Project ({outline.length} sections)
        </Button>
      </div>
    </div>
  )
}
