'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

interface CustomTeamDropdownProps {
  value: string
  onChange: (value: string) => void
  options: Array<{ id: number; title: string }>
  disabled?: boolean
  placeholder?: string
}

export function CustomTeamDropdown({
  value,
  onChange,
  options,
  disabled = false,
  placeholder = 'Select team',
}: CustomTeamDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find(opt => String(opt.id) === value)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        // Notify parent that dropdown was closed
        if (onChange) {
          onChange(value) // Keep current value
        }
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, value, onChange])

  return (
    <div ref={dropdownRef} className="relative w-full">
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="w-full px-2 py-1 text-sm text-left bg-white border border-gray-300 rounded flex items-center justify-between hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="truncate">
          {selectedOption?.title || placeholder}
        </span>
        <ChevronDown className="w-4 h-4 ml-2 flex-shrink-0 text-gray-400" />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-60 overflow-auto">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                onChange(String(option.id))
                setIsOpen(false)
              }}
              className={`
                w-full px-3 py-2 text-sm text-left hover:bg-gray-50 
                ${String(option.id) === value ? 'bg-blue-50 text-blue-900' : 'text-gray-900'}
              `}
            >
              {option.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

