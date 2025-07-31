"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { X, Filter, ChevronDown, Search } from "lucide-react"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useMediaQuery } from "@/hooks/use-media-query"
import { format } from "date-fns"
import { useRouter, useSearchParams } from 'next/navigation'
import { useFilterOptions } from "../../hooks/use-filter-options"

export interface FilterOption {
  id: string
  label: string
  color?: string
}

export interface FilterSection {
  id: string
  label: string
  type: 'multi-select' | 'date-range'
  options?: FilterOption[]
  isSearchable?: boolean
}

export interface FilterValues {
  assignedTo: string[]
  status: string[]
  deliveryDate: {
    from?: Date
    to?: Date
  }
  publicationDate: {
    from?: Date
    to?: Date
  }
  project: string[]
  contentType: string[]
  productionType: string[]
  language: string[]
  channels: string[]
}

interface FilterPaneProps {
  sections: FilterSection[]
  values: FilterValues
  onChange: (values: FilterValues) => void
  onClose?: () => void
  className?: string
}

export function FilterPane({ sections, values, onChange, onClose, className }: FilterPaneProps) {
  const [openSection, setOpenSection] = React.useState<string | null>(null)
  const [searchQueries, setSearchQueries] = React.useState<Record<string, string>>({})
  const isMobile = useMediaQuery("(max-width: 768px)")

  const router = useRouter()
  const params = useSearchParams()

  // Fetch filter options only when pane is open
  const { data: options } = useFilterOptions();

  // Helper: update URL params when filters change
  const syncFiltersToUrl = (newValues: FilterValues) => {
    const newParams = new URLSearchParams(params.toString())
    // For each filter, set or remove param
    Object.entries(newValues).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        if (value.length > 0) newParams.set(key, value.join(','))
        else newParams.delete(key)
      } else if (typeof value === 'object' && value !== null) {
        // Date range
        const { from, to } = value as { from?: Date; to?: Date }
        if (from) newParams.set(`${key}From`, from instanceof Date ? from.toISOString() : from)
        else newParams.delete(`${key}From`)
        if (to) newParams.set(`${key}To`, to instanceof Date ? to.toISOString() : to)
        else newParams.delete(`${key}To`)
      }
    })
    router.replace(`?${newParams.toString()}`)
  }

  const handleMultiSelectChange = (sectionId: string, value: string[]) => {
    const newValues = {
      ...values,
      [sectionId]: value
    }
    onChange(newValues)
    syncFiltersToUrl(newValues)
  }

  const handleDateRangeChange = (sectionId: string, range: { from?: Date; to?: Date }) => {
    const newValues = {
      ...values,
      [sectionId]: range
    }
    onChange(newValues)
    syncFiltersToUrl(newValues)
  }

  const handleSearchChange = (sectionId: string, query: string) => {
    setSearchQueries(prev => ({
      ...prev,
      [sectionId]: query
    }))
  }

  const clearFilter = (sectionId: string) => {
    const key = sectionId as keyof FilterValues
    const newValues = { ...values, [key]: Array.isArray(values[key]) ? [] : {} }
    onChange(newValues)
    syncFiltersToUrl(newValues)
  }

  const clearAllFilters = () => {
    const empty: FilterValues = {
      assignedTo: [],
      status: [],
      deliveryDate: {},
      publicationDate: {},
      project: [],
      contentType: [],
      productionType: [],
      language: [],
      channels: []
    }
    onChange(empty)
    syncFiltersToUrl(empty)
  }

  const filteredOptions = (section: FilterSection) => {
    if (!section.options) return []
    const query = searchQueries[section.id]?.toLowerCase() || ''
    return section.options
      .filter(option => option.label.toLowerCase().includes(query))
      .sort((a, b) => a.label.localeCompare(b.label))
  }

  const getActiveFiltersCount = () => {
    return Object.values(values).filter(value => {
      if (Array.isArray(value)) return value.length > 0
      if (typeof value === 'object') return value.from || value.to
      return false
    }).length
  }

  const handleFilterChange = (key: keyof FilterValues, value: any) => {
    const newValues = { ...values, [key]: value };
    onChange(newValues);
    syncFiltersToUrl(newValues);
  };

  const handleClearAll = () => {
    const emptyFilters: FilterValues = {
      assignedTo: [],
      status: [],
      deliveryDate: {},
      publicationDate: {},
      project: [],
      contentType: [],
      productionType: [],
      language: [],
      channels: []
    };
    onChange(emptyFilters);
    syncFiltersToUrl(emptyFilters);
  };

  return (
    <div className={cn(
      "fixed inset-y-0 right-0 bg-background z-50 w-full md:w-96 shadow-lg",
      isMobile ? "slide-up" : "slide-in-right",
      className
    )}>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Filters</h2>
            {getActiveFiltersCount() > 0 && (
              <Badge variant="secondary">{getActiveFiltersCount()}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="text-muted-foreground"
            >
              Clear all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Active Filters */}
        <div className="flex flex-wrap gap-2 p-4 border-b">
          {Object.entries(values).map(([key, value]) => {
            const section = sections.find(s => s.id === key)
            if (!section) return null

            if (Array.isArray(value) && value.length > 0) {
              return value.map(item => {
                const option = section.options?.find(o => o.id === item)
                return (
                  <Badge
                    key={`${key}-${item}`}
                    variant="secondary"
                    className="flex items-center gap-1"
                  >
                    <span className="capitalize">{section.label}:</span>
                    <span>{option?.label || item}</span>
                    <button
                      onClick={() => {
                        const keyTyped = key as keyof FilterValues
                        const current = values[keyTyped] as string[]
                        const newValue = current.filter(v => v !== item)
                        if (newValue.length === 0) {
                          clearFilter(key)
                        } else {
                          handleMultiSelectChange(key, newValue)
                        }
                      }}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )
              })
            } else if (typeof value === 'object' && value !== null) {
              const { from, to } = value as { from?: Date; to?: Date }
              if (from || to) {
                return (
                  <Badge
                    key={key}
                    variant="secondary"
                    className="flex items-center gap-1"
                  >
                    <span className="capitalize">{section.label}:</span>
                    <span>
                      {from ? format(from, 'MMM d, yyyy') : 'Start'} - {to ? format(to, 'MMM d, yyyy') : 'End'}
                    </span>
                    <button
                      onClick={() => clearFilter(key)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )
              }
            }
            return null
          })}
        </div>

        {/* Filter Sections */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-6">
            {sections.map(section => (
              <div key={section.id} className="space-y-2">
                <label className="text-sm font-medium">{section.label}</label>
                
                {section.type === 'multi-select' && (
                  <div className="relative">
                    {section.isSearchable && (
                      <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search..."
                          value={searchQueries[section.id] || ''}
                          onChange={(e) => handleSearchChange(section.id, e.target.value)}
                          className="pl-8"
                        />
                      </div>
                    )}
                    <div className="mt-2 max-h-[200px] overflow-y-auto rounded-md border">
                      {filteredOptions(section).map(option => (
                        <label
                          key={option.id}
                          className="flex items-center gap-2 p-2 hover:bg-accent cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={((values[section.id as keyof FilterValues] as string[]) || []).includes(option.id as string)}
                            onChange={(e) => {
                              const current = (values[section.id as keyof FilterValues] as string[]) || []
                              const newValue = e.target.checked
                                ? [...current, option.id as string]
                                : current.filter(id => id !== option.id)
                              handleMultiSelectChange(section.id, newValue)
                            }}
                            className="rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <span className="text-sm">
                            {option.label}
                            {option.color && (
                              <span
                                className="ml-2 inline-block w-3 h-3 rounded-full"
                                style={{ backgroundColor: option.color }}
                              />
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {section.type === 'date-range' && (
                  <DateRangePicker
                    value={(values[section.id as keyof FilterValues] as { from?: Date; to?: Date }) || {}}
                    onChange={(range: { from?: Date; to?: Date }) => handleDateRangeChange(section.id, range)}
                  />
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
} 