"use client"

import Link from "next/link"
import { Home, ListTodo, FolderKanban, Users, Inbox, BarChart, CreditCard, Settings } from "lucide-react"
import { cn } from "@/lib/utils"

const navigation = [
  { name: "Home", href: "/", icon: Home },
  { name: "Tasks", href: "/tasks", icon: ListTodo },
  { name: "Projects", href: "/projects", icon: FolderKanban },
  { name: "Teams", href: "/teams", icon: Users },
  { name: "Inbox", href: "/inbox", icon: Inbox },
  { name: "Reports", href: "/reports", icon: BarChart },
  { name: "Billing", href: "/billing", icon: CreditCard },
  { name: "Settings", href: "/settings", icon: Settings },
]

interface SidebarProps {
  isCollapsed: boolean
  isMobileMenuOpen?: boolean
  onClose?: () => void
}

export function Sidebar({ isCollapsed, isMobileMenuOpen = false, onClose }: SidebarProps) {
  // Mobile overlay styles
  const mobileOverlay =
    'fixed inset-0 z-40 bg-black bg-opacity-40 flex md:hidden transition-opacity duration-200';
  const mobileSidebar =
    'fixed top-0 left-0 z-50 bg-white w-64 h-screen shadow-lg p-4';

  return (
    <>
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div className={mobileOverlay}>
          <div className={mobileSidebar}>
            <button
              onClick={onClose}
              className="absolute top-2 right-2 p-2 rounded hover:bg-gray-100"
              aria-label="Close sidebar"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <ul className="space-y-2 mt-8">
              {navigation.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-100 transition-colors",
                      "group relative"
                    )}
                    onClick={onClose}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="ml-2">{item.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {/* Desktop Sidebar */}
      <nav className="h-full p-4 hidden md:block">
        <ul className="space-y-2">
          {navigation.map((item) => (
            <li key={item.name}>
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-100 transition-colors group relative",
                  isCollapsed ? "justify-center" : ""
                )}
              >
                {/* Icon: hidden by default, shown on hover or expanded */}
                <item.icon
                  className={cn(
                    "w-5 h-5 transition-all duration-200",
                    isCollapsed
                      ? "opacity-0 scale-90 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto"
                      : "opacity-100 scale-100"
                  )}
                />
                <span className={cn(
                  "transition-all duration-200",
                  isCollapsed ? "opacity-0 w-0" : "opacity-100 w-auto"
                )}>
                  {item.name}
                </span>
                {/* Tooltip for icon when collapsed */}
                {isCollapsed && (
                  <span className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-sm rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                    {item.name}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
} 