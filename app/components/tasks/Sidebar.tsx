"use client"

import Link from "next/link"
import { Home, ListTodo } from "lucide-react"
import { usePathname } from "next/navigation"

const navigation = [
  { name: "Home", href: "/", icon: Home },
  { name: "Tasks", href: "/tasks", icon: ListTodo },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <nav className="h-full p-4">
      <ul className="space-y-2">
        {navigation.map((item) => (
          <li key={item.name}>
            <Link
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                pathname === item.href
                  ? "bg-blue-100 text-blue-800"
                  : "hover:bg-gray-100"
              }`}
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