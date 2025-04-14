"use client"

import { TestConnection } from "../components/test/TestConnection"

export default function TestPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Supabase Connection Test</h1>
      <TestConnection />
    </div>
  )
} 