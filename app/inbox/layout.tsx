'use client'

import React, { useState, useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Sidebar } from '../components/ui/Sidebar'
import { BillingHeaderBar } from '../components/ui/billing-header-bar'

interface InboxLayoutProps {
  children: React.ReactNode
}

export default function InboxLayout({ children }: InboxLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')

  const handleMobileMenuClose = () => {
    setIsMobileMenuOpen(false)
  }

  const handleSidebarToggle = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed)
  }

  const handleHeaderSidebarToggle = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
      setIsMobileMenuOpen((prev) => !prev)
      return
    }
    handleSidebarToggle()
  }

  // Sync search with URL if needed
  useEffect(() => {
    const urlSearch = searchParams.get('q')
    if (urlSearch !== null && urlSearch !== searchValue) {
      setSearchValue(urlSearch)
    }
  }, [searchParams, searchValue])

  const handleHeaderSearchChange = (value: string) => {
    setSearchValue(value)
    const newParams = new URLSearchParams(searchParams.toString())
    if (value) newParams.set('q', value)
    else newParams.delete('q')
    // When changing search, clear thread selection (keeps UI consistent)
    newParams.delete('thread')
    router.replace(`${pathname}?${newParams.toString()}`)
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Full Width Header Bar */}
      <BillingHeaderBar
        searchValue={searchValue}
        onSearchChange={handleHeaderSearchChange}
        onFilterClick={() => window.dispatchEvent(new CustomEvent('inbox:filter-click'))}
        onSidebarToggle={handleHeaderSidebarToggle}
        placeholder="Search inbox..."
        title="Inbox"
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
          {children}
        </div>
      </div>
    </div>
  )
}

