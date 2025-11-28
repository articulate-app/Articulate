"use client"

import React, { useState, useCallback } from 'react'
import { Button } from '../../../app/components/ui/button'
import { Badge } from '../../../app/components/ui/badge'
import { Checkbox } from '../../../app/components/ui/checkbox'
import { Input } from '../../../app/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '../../../app/components/ui/popover'
import { X, Plus, Search } from 'lucide-react'
import { toast } from '../../../app/components/ui/use-toast'

interface Language {
  language_id: number
  long_name: string
  selected: boolean
}

interface LanguagesSelectorProps {
  languages: Language[]
  loading: boolean
  error: string | null
  onUpdateLanguages: (languageIds: number[]) => Promise<void>
}

export function LanguagesSelector({ 
  languages, 
  loading, 
  error, 
  onUpdateLanguages 
}: LanguagesSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedLanguageIds, setSelectedLanguageIds] = useState<number[]>([])
  const [isUpdating, setIsUpdating] = useState(false)

  // Initialize selected languages from props
  React.useEffect(() => {
    const selected = languages.filter(l => l.selected).map(l => l.language_id)
    setSelectedLanguageIds(selected)
  }, [languages])

  const handleLanguageToggle = useCallback((languageId: number, checked: boolean) => {
    setSelectedLanguageIds(prev => 
      checked 
        ? [...prev, languageId]
        : prev.filter(id => id !== languageId)
    )
  }, [])

  const handleSave = useCallback(async () => {
    setIsUpdating(true)
    try {
      await onUpdateLanguages(selectedLanguageIds)
      setIsOpen(false)
      toast({
        title: "Languages updated",
        description: `${selectedLanguageIds.length} language(s) selected.`,
      })
    } catch (err: any) {
      toast({
        title: "Failed to update languages",
        description: err.message,
        variant: "destructive",
      })
    } finally {
      setIsUpdating(false)
    }
  }, [selectedLanguageIds, onUpdateLanguages])

  const handleRemoveLanguage = useCallback(async (languageId: number) => {
    const newSelection = selectedLanguageIds.filter(id => id !== languageId)
    setIsUpdating(true)
    try {
      await onUpdateLanguages(newSelection)
      toast({
        title: "Language removed",
        description: "Language has been removed from selection.",
      })
    } catch (err: any) {
      toast({
        title: "Failed to remove language",
        description: err.message,
        variant: "destructive",
      })
    } finally {
      setIsUpdating(false)
    }
  }, [selectedLanguageIds, onUpdateLanguages])

  const filteredLanguages = languages.filter(language =>
    language.long_name?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const selectedLanguages = languages.filter(l => selectedLanguageIds.includes(l.language_id))

  if (error) {
    return (
      <div className="text-sm text-red-500">
        Error loading languages: {error}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-400">Languages</label>
      
      {/* Selected languages display */}
      <div className="flex flex-wrap gap-2 min-h-[40px] items-center">
        {selectedLanguages.map(language => (
          <Badge 
            key={language.language_id} 
            variant="secondary" 
            className="flex items-center gap-1 px-2 py-1"
          >
            {language.long_name}
            <button
              onClick={() => handleRemoveLanguage(language.language_id)}
              className="ml-1 hover:text-red-600"
              disabled={isUpdating}
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}
        
        {/* Add language button */}
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={loading || isUpdating}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search languages..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            
            <div className="max-h-60 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-sm text-gray-500 text-center">
                  Loading languages...
                </div>
              ) : filteredLanguages.length === 0 ? (
                <div className="p-4 text-sm text-gray-500 text-center">
                  {searchQuery ? "No languages found" : "No languages available"}
                </div>
              ) : (
                filteredLanguages.map(language => (
                  <div
                    key={language.language_id}
                    className="flex items-center space-x-2 p-2 hover:bg-gray-50"
                  >
                    <Checkbox
                      checked={selectedLanguageIds.includes(language.language_id)}
                      onCheckedChange={(checked) => 
                        handleLanguageToggle(language.language_id, !!checked)
                      }
                    />
                    <span className="text-sm flex-1">{language.long_name}</span>
                  </div>
                ))
              )}
            </div>
            
            {selectedLanguageIds.length > 0 && (
              <div className="p-3 border-t bg-gray-50">
                <Button
                  onClick={handleSave}
                  className="w-full"
                  size="sm"
                  disabled={isUpdating}
                >
                  {isUpdating ? 'Saving...' : `Save ${selectedLanguageIds.length} language${selectedLanguageIds.length > 1 ? 's' : ''}`}
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
