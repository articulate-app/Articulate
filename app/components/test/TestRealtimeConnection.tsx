"use client"

import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export function TestRealtimeConnection() {
  const [status, setStatus] = useState<string>('Connecting...')
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<string[]>([])
  const supabase = createClientComponentClient()

  useEffect(() => {
    console.log('[TestRealtimeConnection] Testing basic realtime connection')
    
    const channel = supabase.channel('test-connection')
    
    channel
      .on('system', { event: 'disconnect' }, () => {
        console.log('[TestRealtimeConnection] Disconnected')
        setStatus('Disconnected')
        setEvents(prev => [...prev, 'Disconnected'])
      })
      .on('system', { event: 'reconnect' }, () => {
        console.log('[TestRealtimeConnection] Reconnected')
        setStatus('Reconnected')
        setEvents(prev => [...prev, 'Reconnected'])
      })
      .subscribe((status) => {
        console.log('[TestRealtimeConnection] Subscription status:', status)
        setStatus(status)
        setEvents(prev => [...prev, `Status: ${status}`])
        
        if (status === 'CHANNEL_ERROR') {
          setError('Channel error occurred')
        }
      })

    return () => {
      console.log('[TestRealtimeConnection] Cleaning up test connection')
      supabase.removeChannel(channel)
    }
  }, [supabase])

  return (
    <div className="p-4 border rounded-lg bg-white">
      <h2 className="text-lg font-semibold mb-4">Basic Realtime Connection Test</h2>
      
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-3 h-3 rounded-full ${
            status === 'SUBSCRIBED' ? 'bg-green-500' : 
            status === 'CHANNEL_ERROR' ? 'bg-red-500' : 
            'bg-yellow-500'
          }`} />
          <span className="text-sm">Status: {status}</span>
        </div>
        
        {error && (
          <div className="text-red-600 text-sm mb-2">
            Error: {error}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="font-medium">Connection Events:</h3>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {events.length === 0 ? (
            <p className="text-gray-500 text-sm">No events yet...</p>
          ) : (
            events.map((event, index) => (
              <div key={index} className="text-xs p-1 bg-gray-50 rounded">
                {event}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
} 