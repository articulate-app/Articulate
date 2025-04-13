'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import { TasksLayout } from '../components/tasks/TasksLayout';

export default function DashboardPage() {
  const [email, setEmail] = useState<string | null>(null);
  const router = useRouter();
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
    <TasksLayout>
      <div className="p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-gray-900">Welcome to your Dashboard</h2>
          <p className="mt-1 text-sm text-gray-600">
            You are signed in as {email}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Add your dashboard content/cards here */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Recent Tasks</h3>
            <p className="mt-2 text-sm text-gray-600">No tasks yet</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Project Status</h3>
            <p className="mt-2 text-sm text-gray-600">No active projects</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Quick Actions</h3>
            <div className="mt-4">
              <button
                onClick={handleSignOut}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </div>
    </TasksLayout>
  );
} 