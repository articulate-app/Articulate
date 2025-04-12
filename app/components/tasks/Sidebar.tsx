"use client"

import Link from "next/link"
import { Home, ListTodo, FolderKanban, Users, Inbox, BarChart, CreditCard, Settings } from "lucide-react"

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

export function Sidebar() {
  return (
    <nav className="h-full p-4">
      <ul className="space-y-2">
        {navigation.map((item) => (
          <li key={item.name}>
            <Link
              href={item.href}
              className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-100 transition-colors"
            >
              <item.icon className="w-5 h-5" />
              <span>{item.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
} 