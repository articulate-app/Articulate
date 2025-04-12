'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const [email, setEmail] = useState<string | null>(null);
  const router = useRouter();
  
  // Initialize the Supabase client
  const supabase = createClientComponentClient();

  useEffect(() => {
    const getUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      
      if (error) {
        console.error('Error fetching user:', error.message);
        return;
      }
      
      if (data?.user) {
        setEmail(data.user.email || null);
      }
    };

    getUser();
  }, [supabase.auth]);

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      console.error('Error signing out:', error.message);
      return;
    }
    
    router.push('/auth');
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Welcome to your Dashboard
            </h3>
            <div className="mt-2 max-w-xl text-sm text-gray-500">
              <p>You are signed in as: {email}</p>
            </div>
            <div className="mt-5">
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 