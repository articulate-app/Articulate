"use client"

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { FileText, CreditCard, Minus, Plus, Package } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Sidebar } from '../components/ui/Sidebar'

const navigation = [
  { name: 'Supplier Invoices', href: '/expenses/supplier-invoices', icon: FileText },
  { name: 'Supplier Payments', href: '/expenses/supplier-payments', icon: CreditCard },
  { name: 'Supplier Credit Notes', href: '/expenses/supplier-credit-notes', icon: Minus },
  { name: 'Production Orders', href: '/expenses/production-orders', icon: Package },
]

interface ExpensesLayoutProps {
  children: React.ReactNode
}

export default function ExpensesLayout({ children }: ExpensesLayoutProps) {
  const pathname = usePathname()
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  const getCreateButtonText = () => {
    if (pathname === '/expenses/supplier-invoices') return 'Add'
    if (pathname === '/expenses/supplier-payments') return 'Add'
    if (pathname === '/expenses/supplier-credit-notes') return 'Add'
    if (pathname === '/expenses/production-orders') return 'Add'
    return 'Add'
  }

  const handleCreateClick = () => {
    // This will be handled by each individual page
    // We'll emit an event that each page can listen to
    window.dispatchEvent(new CustomEvent('expenses:create', { detail: { pathname } }))
  }

  const handleSidebarToggle = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed)
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header Bar with Hamburger Icon */}
      <header className="w-full sticky top-0 z-30 bg-white border-b flex items-center h-16 px-4 gap-4 shadow-sm">
        {/* Hamburger icon */}
        <button
          type="button"
          className="flex items-center justify-center p-2 rounded hover:bg-gray-100 focus:outline-none"
          aria-label="Toggle sidebar"
          onClick={handleSidebarToggle}
        >
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        {/* App name */}
        <span className="text-2xl font-bold tracking-tight text-gray-900 select-none mr-4">Expenses</span>
      </header>

      {/* Main Content Area with Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className={`border-r border-gray-200 transition-all duration-300 ease-in-out z-20 flex-shrink-0 ${isSidebarCollapsed ? 'w-16' : 'w-64'}`}>
          <Sidebar isCollapsed={isSidebarCollapsed} />
        </div>

        {/* Page Content */}
        <div className="flex-1 overflow-hidden">
          <div className="flex flex-col h-full">
            {/* Expenses Navigation */}
            <div className="bg-white border-b border-gray-200 px-6 py-4">
              <div className="flex items-center justify-between">
                <nav className="flex space-x-1">
                  {navigation.map((item) => {
                    const isActive = pathname === item.href
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={cn(
                          'px-3 py-2 text-sm font-medium transition-colors border-b-2',
                          isActive
                            ? 'text-gray-900 border-gray-900'
                            : 'text-gray-500 hover:text-gray-700 border-transparent hover:border-gray-300'
                        )}
                      >
                        {item.name}
                      </Link>
                    )
                  })}
                </nav>
                <Button onClick={handleCreateClick} className="bg-black text-white hover:bg-gray-800">
                  <Plus className="w-4 h-4 mr-2" />
                  {getCreateButtonText()}
                </Button>
              </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-hidden">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 