'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function SimpleTest() {
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const testConnection = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Create a Supabase client
      const supabase = createClientComponentClient();
      
      // Make a simple query to the public schema
      const { data, error } = await supabase
        .from('users')
        .select('count')
        .limit(1);
      
      if (error) {
        setError(`Error: ${error.message}`);
        return;
      }
      
      setResult(`Connection successful! Data: ${JSON.stringify(data)}`);
    } catch (err: any) {
      setError(`Exception: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <h3 className="text-lg font-medium">Simple Supabase Test</h3>
      <button
        onClick={testConnection}
        disabled={loading}
        className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
      >
        {loading ? 'Testing...' : 'Test Connection'}
      </button>
      
      {result && (
        <div className="mt-2 p-2 bg-green-100 text-green-800 rounded">
          {result}
        </div>
      )}
      
      {error && (
        <div className="mt-2 p-2 bg-red-100 text-red-800 rounded">
          {error}
        </div>
      )}
    </div>
  );
} 