"use client"

import Link from "next/link"
import { Home, ListTodo, FolderKanban, Users, Inbox, BarChart, CreditCard, Settings, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from '@/lib/supabase/client'
import { useCurrentUserStore } from '../../store/current-user'

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
  const supabase = createClient();
  const publicUserId = useCurrentUserStore((s) => s.publicUserId);
  const fullName = useCurrentUserStore((s) => s.fullName);
  const userMetadata = useCurrentUserStore((s) => s.userMetadata);

  // Helper to get user initials
  function getUserInitials() {
    // First try to use full_name from the users table
    if (fullName) {
      const parts = fullName.trim().split(' ');
      if (parts.length === 1) return parts[0][0].toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    
    // Fallback to user metadata
    if (userMetadata?.full_name) {
      const parts = userMetadata.full_name.trim().split(' ');
      if (parts.length === 1) return parts[0][0].toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    
    // Fallback to email from metadata
    if (userMetadata?.email) {
      return userMetadata.email[0].toUpperCase();
    }
    
    return 'U';
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

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
            
            {/* User info and sign out */}
            <div className="mt-auto pt-4 border-t border-gray-200">
              <div className="flex items-center gap-3 px-3 py-2">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 border border-gray-200 font-medium text-sm">
                  {getUserInitials()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {fullName || userMetadata?.full_name || userMetadata?.email || 'User'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-3 px-3 py-2 w-full text-left rounded-md hover:bg-gray-100 transition-colors text-gray-700"
              >
                <LogOut className="w-5 h-5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Desktop Sidebar */}
      <nav className="h-full p-4 hidden md:block flex flex-col">
        <ul className="space-y-2 flex-1">
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
        
        {/* User info and sign out - desktop */}
        <div className="pt-4 border-t border-gray-200">
          <div className={cn(
            "flex items-center gap-3 px-3 py-2",
            isCollapsed ? "justify-center" : ""
          )}>
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 border border-gray-200 font-medium text-sm">
              {getUserInitials()}
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {fullName || userMetadata?.full_name || userMetadata?.email || 'User'}
                </p>
              </div>
            )}
          </div>
          <button
            onClick={handleSignOut}
            className={cn(
              "flex items-center gap-3 px-3 py-2 w-full text-left rounded-md hover:bg-gray-100 transition-colors text-gray-700",
              isCollapsed ? "justify-center" : ""
            )}
          >
            <LogOut className="w-5 h-5" />
            {!isCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </nav>
    </>
  )
} 