'use client';

import { useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useCurrentUserStore } from '../../store/current-user';

export function CurrentUserProvider({ children }: { children: React.ReactNode }) {
  const setPublicUserId = useCurrentUserStore((s) => s.setPublicUserId);
  const setFullName = useCurrentUserStore((s) => s.setFullName);
  const setUserMetadata = useCurrentUserStore((s) => s.setUserMetadata);

  useEffect(() => {
    console.log('CurrentUserProvider useEffect running');
    const supabase = createClientComponentClient();
    async function fetchPublicUserId() {
      const { data: { session } } = await supabase.auth.getSession();
      const authUserId = session?.user?.id;
      if (!authUserId) return;

      const { data: userRow, error } = await supabase
        .from('users')
        .select('id, full_name')
        .eq('auth_user_id', authUserId)
        .single();

      if (!error && userRow?.id) {
        console.log('Fetched public user ID:', userRow.id);
        setPublicUserId(userRow.id);
        setFullName(userRow.full_name);
        setUserMetadata(session?.user?.user_metadata);
      } else {
        setPublicUserId(null);
        setFullName(null);
        setUserMetadata(null);
        if (error) console.error('Failed to fetch public user ID:', error);
      }
    }
    fetchPublicUserId();
  }, [setPublicUserId, setFullName, setUserMetadata]);

  return <>{children}</>;
} 