"use client"

import { Badge } from '../../components/ui/badge'
import { cn } from '../../lib/utils'

interface DocumentsFilterPillsProps {
  selectedDirection: string
  selectedKinds: string[]
  onDirectionChange: (direction: string) => void
  onKindsChange: (kinds: string[]) => void
}

export function DocumentsFilterPills({ 
  selectedDirection, 
  selectedKinds, 
  onDirectionChange, 
  onKindsChange 
}: DocumentsFilterPillsProps) {
  const directionOptions = [
    { value: 'ar', label: 'Accounts Receivable' },
    { value: 'ap', label: 'Accounts Payable' },
  ]

  const kindOptions = [
    { value: 'invoice', label: 'Invoices' },
    { value: 'invoice_order', label: 'Invoice Orders' },
    { value: 'credit_note', label: 'Credit Notes' },
    { value: 'client_payment', label: 'Payments' },
    { value: 'supplier_payment', label: 'Payments' },
  ]

  const handleDirectionClick = (direction: string) => {
    if (selectedDirection === direction) {
      // If clicking the same direction, deselect it
      onDirectionChange('')
    } else {
      // Select the new direction
      onDirectionChange(direction)
    }
  }

  const handleKindClick = (kind: string) => {
    if (selectedKinds.includes(kind)) {
      // Remove the kind if it's already selected
      onKindsChange(selectedKinds.filter(k => k !== kind))
    } else {
      // Add the kind if it's not selected
      onKindsChange([...selectedKinds, kind])
    }
  }

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-3">
      <div className="flex flex-wrap gap-2">
        {/* Direction Pills */}
        <div className="flex gap-2 mr-4">
          {directionOptions.map((option) => (
            <Badge
              key={option.value}
              variant={selectedDirection === option.value ? "default" : "outline"}
              className={cn(
                "cursor-pointer transition-colors",
                selectedDirection === option.value 
                  ? "bg-blue-600 text-white hover:bg-blue-700" 
                  : "hover:bg-gray-100"
              )}
              onClick={() => handleDirectionClick(option.value)}
            >
              {option.label}
            </Badge>
          ))}
        </div>

        {/* Kind Pills */}
        <div className="flex gap-2">
          {kindOptions.map((option) => (
            <Badge
              key={option.value}
              variant={selectedKinds.includes(option.value) ? "default" : "outline"}
              className={cn(
                "cursor-pointer transition-colors",
                selectedKinds.includes(option.value)
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "hover:bg-gray-100"
              )}
              onClick={() => handleKindClick(option.value)}
            >
              {option.label}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  )
}
