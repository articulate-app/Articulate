import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';

export default async function TestSSRAuthPage() {
  const supabase = createServerComponentClient({ cookies });
  const { data: { session }, error } = await supabase.auth.getSession();

  return (
    <div style={{ padding: 32 }}>
      <h1>SSR Auth Test</h1>
      <pre>
        {JSON.stringify({ session, error }, null, 2)}
      </pre>
    </div>
  );
} 