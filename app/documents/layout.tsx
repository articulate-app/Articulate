"use client"

import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { BillingHeaderBar } from '../components/ui/billing-header-bar'
import { Sidebar } from '../components/ui/Sidebar'

interface DocumentsLayoutProps {
  children: React.ReactNode
}

export default function DocumentsLayout({ children }: DocumentsLayoutProps) {
  const searchParams = useSearchParams()
  const [searchValue, setSearchValue] = useState('')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const handleSidebarToggle = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed)
  }

  const handleMobileMenuToggle = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen)
  }

  const handleMobileMenuClose = () => {
    setIsMobileMenuOpen(false)
  }

  // Sync search value from URL on mount and when URL changes
  useEffect(() => {
    const urlSearchValue = searchParams.get('q') || ''
    setSearchValue(urlSearchValue)
  }, [searchParams])

  // Debug search value changes
  useEffect(() => {
    console.log('[DocumentsLayout] Search value changed:', searchValue)
  }, [searchValue])

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Full Width Header Bar with Search */}
      <BillingHeaderBar
        searchValue={searchValue}
        onSearchChange={(value) => {
          setSearchValue(value)
          // Dispatch search event for pages to listen to
          window.dispatchEvent(new CustomEvent('documents:search', { detail: { value } }))
        }}
        onFilterClick={() => {
          // Dispatch filter event for pages to listen to
          window.dispatchEvent(new CustomEvent('documents:filter-click'))
        }}
        onSidebarToggle={handleMobileMenuToggle}
        placeholder="Search documents..."
        title="Financials"
      />

      {/* Main Content Area with Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className={`border-r border-gray-200 transition-all duration-300 ease-in-out z-20 flex-shrink-0 ${isSidebarCollapsed ? 'w-16' : 'w-64'}`}>
          <Sidebar 
            isCollapsed={isSidebarCollapsed} 
            isMobileMenuOpen={isMobileMenuOpen} 
            onClose={handleMobileMenuClose} 
          />
        </div>

        {/* Page Content */}
        <div className="flex-1 overflow-hidden">
          {React.cloneElement(children as React.ReactElement, {
            isSidebarCollapsed,
            onSidebarToggle: handleSidebarToggle,
            searchValue: searchValue,
            onSearchChange: setSearchValue
          })}
        </div>
      </div>
    </div>
  )
}
