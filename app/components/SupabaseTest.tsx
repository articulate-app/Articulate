'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function SupabaseTest() {
  const [status, setStatus] = useState<string>('Loading...');
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const testConnection = async () => {
      try {
        const supabase = createClientComponentClient();
        
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          setError(error.message);
          setStatus('Connection failed');
          return;
        }
        
        setStatus(data.session ? 'Connected (User logged in)' : 'Connected (No user logged in)');
      } catch (err: any) {
        setError(err.message);
        setStatus('Connection failed');
      }
    };
    
    testConnection();
  }, []);
  
  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <h3 className="text-lg font-medium">Supabase Connection Test</h3>
      <p className="mt-2">Status: {status}</p>
      {error && <p className="mt-2 text-red-500">Error: {error}</p>}
    </div>
  );
} 