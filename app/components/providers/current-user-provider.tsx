'use client';

import { useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useCurrentUserStore } from '../../store/current-user';

export function CurrentUserProvider({ children }: { children: React.ReactNode }) {
  const setPublicUserId = useCurrentUserStore((s) => s.setPublicUserId);
  const setFullName = useCurrentUserStore((s) => s.setFullName);
  const setUserMetadata = useCurrentUserStore((s) => s.setUserMetadata);
  const setUserTeams = useCurrentUserStore((s) => s.setUserTeams);

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

        // Fetch user teams - only need team IDs for AR/AP detection
        const { data: teamsData, error: teamsError } = await supabase
          .from('teams_users')
          .select('team_id')
          .eq('user_id', userRow.id);

        if (!teamsError && teamsData) {
          const userTeams = teamsData.map((item: any) => ({
            team_id: item.team_id,
            team_name: `Team ${item.team_id}` // Placeholder name since we only need IDs
          }));
          setUserTeams(userTeams);
          console.log('Fetched user teams:', userTeams);
        } else {
          setUserTeams([]);
          if (teamsError) console.error('Failed to fetch user teams:', teamsError);
        }
      } else {
        setPublicUserId(null);
        setFullName(null);
        setUserMetadata(null);
        setUserTeams([]);
        if (error) console.error('Failed to fetch public user ID:', error);
      }
    }
    fetchPublicUserId();
  }, [setPublicUserId, setFullName, setUserMetadata, setUserTeams]);

  return <>{children}</>;
} 