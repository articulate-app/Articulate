"use client"

import { useEffect, useState } from "react"
import { createClient } from '@supabase/supabase-js'

export function TestConnection() {
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function testConnection() {
      try {
        // Create a new Supabase client
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL || '',
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
          {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true
            }
          }
        )

        // First try to sign in
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: 'app@whyarticulate.com',
          password: '1234567'
        })

        if (authError) {
          setError(`Auth error: ${authError.message}`)
          return
        }

        // Try to get table information
        const { data: tables, error: tablesError } = await supabase
          .from('tasks')
          .select('*')
          .limit(1)

        if (tablesError) {
          setError(`Error getting tables: ${tablesError.message}`)
          return
        }

        // Then try to fetch one task with all its relations
        const { data, error } = await supabase
          .from('tasks')
          .select(`
            *,
            project:projects(name),
            status:project_statuses(name),
            content_type:content_types(name),
            production_type:production_types(name),
            language:languages(name)
          `)
          .limit(1)
          .single()

        if (error) {
          setError(`Error fetching task: ${error.message}`)
          return
        }

        setResult(data)
      } catch (err) {
        setError(`Test error: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    testConnection()
  }, [])

  return (
    <div className="p-4 border rounded-lg">
      <h2 className="text-xl font-bold mb-4">Connection Test</h2>
      
      {error && (
        <div className="text-red-500 mb-4">
          <h3 className="font-semibold">Error:</h3>
          <pre className="whitespace-pre-wrap">{error}</pre>
        </div>
      )}

      {result && (
        <div className="text-green-500">
          <h3 className="font-semibold">Success!</h3>
          <pre className="whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}

      {!error && !result && (
        <div className="text-gray-500">Testing connection...</div>
      )}
    </div>
  )
} 