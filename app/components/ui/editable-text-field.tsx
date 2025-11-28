'use client'

import { useState, useEffect, useRef } from 'react'
import { useDebounce } from '../../hooks/use-debounce'

interface EditableTextFieldProps {
  value: string | number | null
  onSave: (newValue: string) => Promise<void>
  placeholder?: string
  type?: 'text' | 'number' | 'date'
  className?: string
  formatter?: (value: string | number | null) => string
  parser?: (value: string) => string
  isEditMode?: boolean // Controlled editing state
  isEditable?: boolean // Whether field can be edited (default: true)
}

export function EditableTextField({
  value,
  onSave,
  placeholder = '',
  type = 'text',
  className = '',
  formatter,
  parser,
  isEditMode = false,
  isEditable = true,
}: EditableTextFieldProps) {
  const [editValue, setEditValue] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLocalEditing, setIsLocalEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Format display value
  const displayValue = formatter 
    ? formatter(value) 
    : (value?.toString() || placeholder)

  // Initialize edit value when entering edit mode
  useEffect(() => {
    if (isEditMode || isLocalEditing) {
      setEditValue(value?.toString() || '')
      setError(null)
    }
  }, [isEditMode, isLocalEditing, value])

  // Handle click to edit
  const handleClick = () => {
    if (!isEditable) return
    setIsLocalEditing(true)
    setEditValue(value?.toString() || '')
    setError(null)
  }

  // Focus input when in edit mode
  useEffect(() => {
    if ((isEditMode || isLocalEditing) && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditMode, isLocalEditing])

  // Handle save
  const handleSave = async () => {
    if (!isEditMode && !isLocalEditing) return

    const trimmedValue = editValue.trim()
    const parsedValue = parser ? parser(trimmedValue) : trimmedValue

    // If value unchanged or empty (placeholder), no need to save
    if (parsedValue === value?.toString() || (parsedValue === '' && !value)) {
      setIsLocalEditing(false)
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      await onSave(parsedValue)
      setIsLocalEditing(false)
    } catch (err) {
      console.error('Failed to save:', err)
      setError('Failed to save')
      // Revert to original value
      setEditValue(value?.toString() || '')
    } finally {
      setIsSaving(false)
    }
  }

  // Handle blur - save on blur
  const handleBlur = () => {
    setTimeout(() => {
      handleSave()
    }, 100)
  }

  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      setEditValue(value?.toString() || '')
      setError(null)
      setIsLocalEditing(false)
    }
  }

  return (
    <div ref={containerRef} className="relative flex justify-end">
      {(isEditMode || isLocalEditing) ? (
        <div className="flex items-center gap-2 w-full max-w-[200px]">
          <input
            ref={inputRef}
            type={type}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            disabled={isSaving}
            className="w-full px-2 py-1 text-sm text-gray-900 text-right rounded border border-gray-300 bg-white focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
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

