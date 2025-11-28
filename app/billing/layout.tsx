"use client"

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { FileText, Receipt, CreditCard, Plus, Minus } from 'lucide-react'
import { Button } from '../components/ui/button'
import { BillingHeaderBar } from '../components/ui/billing-header-bar'
import { Sidebar } from '../components/ui/Sidebar'

const navigation = [
  { name: 'Invoices', href: '/billing/invoices', icon: FileText },
  { name: 'Invoice Orders', href: '/billing/invoice-orders', icon: Receipt },
  { name: 'Payments', href: '/billing/payments', icon: CreditCard },
  { name: 'Credit Notes', href: '/billing/credit-notes', icon: Minus },
]

interface BillingLayoutProps {
  children: React.ReactNode
}

export default function BillingLayout({ children }: BillingLayoutProps) {
  const pathname = usePathname()
  const params = useSearchParams()
  const [searchValue, setSearchValue] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  // Initialize search value from URL on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(params.toString())
    let initialSearch = ''
    
    if (pathname === '/billing/invoices') {
      initialSearch = urlParams.get('q') || ''
    } else if (pathname === '/billing/invoice-orders') {
      initialSearch = urlParams.get('search') || ''
    } else if (pathname === '/billing/payments') {
      initialSearch = urlParams.get('search') || ''
    } else if (pathname === '/billing/credit-notes') {
      initialSearch = urlParams.get('search') || ''
    }
    
    if (initialSearch) {
      setSearchValue(initialSearch)
    }
  }, [pathname, params])

  const getCreateButtonText = () => {
    if (pathname === '/billing/invoices') return 'Create Invoice'
    if (pathname === '/billing/invoice-orders') return 'Create Invoice Order'
    if (pathname === '/billing/payments') return 'Create Payment'
    if (pathname === '/billing/credit-notes') return 'Create Credit Note'
    return 'Create'
  }

  const getSearchPlaceholder = () => {
    if (pathname === '/billing/invoices') return 'Search invoice number...'
    if (pathname === '/billing/invoice-orders') return 'Search project name...'
    if (pathname === '/billing/payments') return 'Search payments...'
    if (pathname === '/billing/credit-notes') return 'Search credit notes...'
    return 'Search...'
  }

  const handleCreateClick = () => {
    // This will be handled by each individual page
    // We'll emit an event that each page can listen to
    window.dispatchEvent(new CustomEvent('billing:create', { detail: { pathname } }))
  }

  const handleFilterClick = () => {
    // Dispatch an event that individual pages can listen to
    window.dispatchEvent(new CustomEvent('billing:filter-click', { detail: { pathname } }))
  }

  const handleSidebarToggle = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed)
  }

  // Debug search value changes
  useEffect(() => {
    console.log('[BillingLayout] Search value changed:', searchValue)
  }, [searchValue])

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Full Width Header Bar with Search */}
      <BillingHeaderBar
        searchValue={searchValue}
        onSearchChange={(value) => {
          setSearchValue(value)
          // Dispatch search event for pages to listen to
          window.dispatchEvent(new CustomEvent('billing:search', { detail: { value, pathname } }))
        }}
        onFilterClick={handleFilterClick}
        onSidebarToggle={handleSidebarToggle}
        placeholder={getSearchPlaceholder()}
      />


      {/* Main Content Area with Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className={`border-r border-gray-200 transition-all duration-300 ease-in-out z-20 flex-shrink-0 ${isSidebarCollapsed ? 'w-16' : 'w-64'}`}>
          <Sidebar isCollapsed={isSidebarCollapsed} />
        </div>

        {/* Page Content */}
        <div className="flex-1 overflow-hidden">
          {React.cloneElement(children as React.ReactElement, {
            onFilterClick: handleFilterClick,
            isFilterOpen,
            setIsFilterOpen
          })}
        </div>
      </div>
    </div>
  )
} 
 
 
 
 


