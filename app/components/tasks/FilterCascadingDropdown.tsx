"use client"

import { useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '../ui/command'
import { Check } from 'lucide-react'
import type { TaskFilters as TaskFiltersType } from '../../store/tasks-ui'
import type { FilterOptions } from '../../lib/services/filters'

interface FilterCascadingDropdownProps {
  editFields?: any
  filterOptions?: FilterOptions
  filters: TaskFiltersType
  setFilters: (filters: TaskFiltersType) => void
  router: any
  pathname: string
  params: URLSearchParams
  className?: string
}

const FILTER_CATEGORIES = [
  { id: 'assignedTo', label: 'Assigned To' },
  { id: 'status', label: 'Status' },
  { id: 'project', label: 'Project' },
  { id: 'contentType', label: 'Content Type' },
  { id: 'productionType', label: 'Production Type' },
  { id: 'language', label: 'Language' },
  { id: 'channels', label: 'Channels' },
  { id: 'overdueStatus', label: 'Overdue Status' },
] as const

export function FilterCascadingDropdown({
  editFields,
  filterOptions,
  filters,
  setFilters,
  router,
  pathname,
  params,
  className
}: FilterCascadingDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [categorySearch, setCategorySearch] = useState('')
  const [optionSearch, setOptionSearch] = useState('')
  
  const updateUrl = (newFilters: TaskFiltersType) => {
    const newParams = new URLSearchParams(params.toString());
    [
      'assignedTo','status','project','contentType','productionType','language','channels','overdueStatus',
      'deliveryDateFrom','deliveryDateTo','publicationDateFrom','publicationDateTo'
    ].forEach((key: string) => newParams.delete(key));
    if (newFilters.assignedTo?.length) newParams.set('assignedTo', newFilters.assignedTo.join(','));
    if (newFilters.status?.length) newParams.set('status', newFilters.status.join(','));
    if (newFilters.project?.length) newParams.set('project', newFilters.project.join(','));
    if (newFilters.contentType?.length) newParams.set('contentType', newFilters.contentType.join(','));
    if (newFilters.productionType?.length) newParams.set('productionType', newFilters.productionType.join(','));
    if (newFilters.language?.length) newParams.set('language', newFilters.language.join(','));
    if (newFilters.channels?.length) newParams.set('channels', newFilters.channels.join(','));
    if (newFilters.overdueStatus?.length) newParams.set('overdueStatus', newFilters.overdueStatus.join(','));
    if (newFilters.deliveryDate?.from) newParams.set('deliveryDateFrom', newFilters.deliveryDate.from.toISOString().slice(0,10));
    if (newFilters.deliveryDate?.to) newParams.set('deliveryDateTo', newFilters.deliveryDate.to.toISOString().slice(0,10));
    if (newFilters.publicationDate?.from) newParams.set('publicationDateFrom', newFilters.publicationDate.from.toISOString().slice(0,10));
    if (newFilters.publicationDate?.to) newParams.set('publicationDateTo', newFilters.publicationDate.to.toISOString().slice(0,10));
    router.replace(`${pathname}?${newParams.toString()}`);
    setFilters(newFilters);
  };
  
  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId)
    setOptionSearch('')
  }
  
  const handleOptionSelect = (categoryId: string, optionId: string) => {
    const currentValues = (filters as any)[categoryId] as string[] || []
    const newValues = currentValues.includes(optionId)
      ? currentValues.filter((v: string) => v !== optionId)
      : [...currentValues, optionId]
    
    const newFilters = { ...filters, [categoryId]: newValues }
    updateUrl(newFilters)
  }
  
  const getCategoryOptions = (categoryId: string) => {
    if (!filterOptions) return []
    
    switch (categoryId) {
      case 'assignedTo':
        return (filterOptions.users || []).map(u => ({ id: u.value, label: u.label }))
      case 'status':
        return (filterOptions.statuses || []).map(s => ({ id: s.value, label: s.label, color: s.color }))
      case 'project':
        return (filterOptions.projects || []).map(p => ({ id: p.value, label: p.label }))
      case 'contentType':
        return (filterOptions.contentTypes || []).map(c => ({ id: c.value, label: c.label }))
      case 'productionType':
        return (filterOptions.productionTypes || []).map(p => ({ id: p.value, label: p.label }))
      case 'language':
        return (filterOptions.languages || []).map(l => ({ id: l.value, label: l.label }))
      case 'channels':
        return (filterOptions.channels || []).map(ch => ({ id: ch.value, label: ch.label }))
      case 'overdueStatus':
        return [
          { id: 'delivery_overdue', label: 'Delivery overdue' },
          { id: 'publication_overdue', label: 'Publication overdue' }
        ]
      default:
        return []
    }
  }
  
  const filteredCategories = FILTER_CATEGORIES.filter(cat =>
    cat.label.toLowerCase().includes(categorySearch.toLowerCase())
  )
  
  const categoryOptions = selectedCategory ? getCategoryOptions(selectedCategory) : []
  const filteredOptions = categoryOptions.filter(opt =>
    opt.label.toLowerCase().includes(optionSearch.toLowerCase())
  )
  
  const activeFiltersCount = Object.values(filters).reduce((count, val) => {
    if (Array.isArray(val)) return count + val.length
    if (val && typeof val === 'object' && ('from' in val || 'to' in val)) {
      return count + ((val.from ? 1 : 0) + (val.to ? 1 : 0))
    }
    return count
  }, 0)
  
  return (
    <Popover open={isOpen} onOpenChange={(open) => {
      setIsOpen(open)
      if (!open) {
        setSelectedCategory(null)
        setCategorySearch('')
        setOptionSearch('')
      }
    }}>
      <PopoverTrigger asChild>
        <button 
          type="button" 
          className={cn(
            'gap-2 ml-2 inline-flex items-center',
            className,
            activeFiltersCount > 0 && 'font-semibold'
          )}
        >
          {activeFiltersCount > 0 
            ? `${activeFiltersCount} Filter${activeFiltersCount > 1 ? 's' : ''}`
            : 'Filters'}
          <ChevronDown className="w-4 h-4 ml-1" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="flex h-[400px]">
          {/* First dropdown - Categories */}
          <div className="flex-1 border-r border-gray-200">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search filters..."
                value={categorySearch}
                onValueChange={setCategorySearch}
                className="text-gray-900"
              />
              <CommandGroup className="max-h-[360px] overflow-y-auto">
                {filteredCategories.map((category) => (
                  <CommandItem
                    key={category.id}
                    value={category.label}
                    onSelect={() => handleCategorySelect(category.id)}
                    className={cn(
                      "flex items-center justify-between px-2 py-1.5 text-sm cursor-pointer",
                      selectedCategory === category.id && "bg-blue-50"
                    )}
                  >
                    <span>{category.label}</span>
                    {selectedCategory === category.id && (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </Command>
          </div>
          
          {/* Second dropdown - Options (only shown when category is selected) */}
          {selectedCategory && (
            <div className="flex-1">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder={`Search ${FILTER_CATEGORIES.find(c => c.id === selectedCategory)?.label.toLowerCase()}...`}
                  value={optionSearch}
                  onValueChange={setOptionSearch}
                  className="text-gray-900"
                />
                {filteredOptions.length === 0 && (
                  <CommandEmpty className="py-2 text-sm text-gray-600">
                    No options found.
                  </CommandEmpty>
                )}
                <CommandGroup className="max-h-[360px] overflow-y-auto">
                  {filteredOptions.map((option) => {
                    const currentValues = (filters as any)[selectedCategory] as string[] || []
                    const isSelected = currentValues.includes(option.id)
                    return (
                      <CommandItem
                        key={option.id}
                        value={option.label}
                        onSelect={() => handleOptionSelect(selectedCategory, option.id)}
                        className="flex items-center px-2 py-1.5 text-sm text-gray-900 cursor-pointer"
                      >
                        <div className="flex h-4 w-4 items-center justify-center mr-2">
                          <Check
                            className={cn(
                              "h-4 w-4",
                              isSelected ? "opacity-100" : "opacity-0"
                            )}
                          />
                        </div>
                        <span>{option.label}</span>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </Command>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}


