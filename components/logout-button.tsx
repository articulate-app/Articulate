'use client';

import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';

export function LogoutButton() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/auth');
  };

  return (
    <Button
      variant="ghost"
      onClick={handleLogout}
      className="flex items-center gap-2"
    >
      <Icons.logout className="h-4 w-4" />
      Logout
    </Button>
  );
} 