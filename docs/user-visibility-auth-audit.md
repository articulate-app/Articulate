# User Visibility Authentication Audit

## Summary
All queries to user visibility views (`v_users_minimal_i_can_see` and `view_users_i_can_see`) are now properly authenticated via the Supabase client with logged-in user sessions.

## Critical Fix

### Issue Found
**Sidebar.tsx** was using the raw `createClient()` from `@/lib/supabase/client` which creates a Supabase client **without session handling**. This meant:
- `auth.uid()` would be NULL in SQL
- RLS policies would fail
- Views would return 0 rows

### Fix Applied
Changed Sidebar.tsx to use `createClientComponentClient` from `@supabase/auth-helpers-nextjs`:

```typescript
// BEFORE (❌ Wrong - no auth session)
import { createClient } from '@/lib/supabase/client'
const supabase = createClient()

// AFTER (✅ Correct - authenticated session)
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
const supabase = createClientComponentClient()
```

## Verification Results

### Files Using `v_users_minimal_i_can_see`
1. ✅ **app/components/ui/Sidebar.tsx** - FIXED to use `createClientComponentClient`
2. ✅ **app/lib/services/users.ts** - Already uses `createClientComponentClient`

### Files Using `view_users_i_can_see`
All verified to use authenticated clients:

1. ✅ **app/components/projects/ProjectWatchers.tsx** - uses `createClientComponentClient`
2. ✅ **app/tasks/layout.tsx** - uses `createClientComponentClient`
3. ✅ **app/lib/services/filters.ts** - uses `createClientComponentClient`
4. ✅ **app/lib/users.ts** - uses `createClientComponentClient`
5. ✅ **hooks/useThreadedChat.ts** - uses `createClientComponentClient`
6. ✅ **app/components/task-activity/task-activity-timeline.tsx** - uses `createClientComponentClient`
7. ✅ **components/ui/filter-pane.tsx** - uses `createClientComponentClient`
8. ✅ **lib/services_legacy/filters.ts** - uses `createClientComponentClient`
9. ✅ **hooks/use-task-filters.ts** - uses `createClientComponentClient`
10. ✅ **app/lib/services/tasks-grouping.ts** - uses `createClientComponentClient`

## No Issues Found

### ✅ No Manual REST Calls
- No instances of `fetch()` or `axios()` calls to Supabase REST endpoints
- No hardcoded URLs like `https://hlszgarnpleikfkwujph.supabase.co/rest/v1/...`

### ✅ No Manual Viewer Parameters
- No `viewer_user_id` query parameters found in user visibility queries
- No `auth_user_id` parameters being passed to views
- The only `auth_user_id` reference is in the `UserProfile` type definition (legitimate DB column)

### ✅ Proper Session Handling
All files use the official Supabase Auth Helpers:
- `createClientComponentClient` from `@supabase/auth-helpers-nextjs` for client components
- This automatically attaches the `Authorization: Bearer <access_token>` header
- `auth.uid()` in SQL will properly resolve to the logged-in user

## How It Works

### Authenticated Flow
```
User logs in → Supabase Auth creates session → 
createClientComponentClient() includes session in requests →
JWT sent as Authorization header →
auth.uid() in SQL resolves to logged-in user →
RLS policies enforce visibility →
Views return filtered data
```

### Example Query Pattern (Correct ✅)
```typescript
const supabase = createClientComponentClient()
const { data, error } = await supabase
  .from('v_users_minimal_i_can_see')
  .select('id, full_name, email, photo, brand')
  .order('full_name', { ascending: true })
// ✅ Automatically includes: Authorization: Bearer <jwt-token>
// ✅ SQL auth.uid() resolves correctly
// ✅ RLS policies apply
```

## Security Confirmation

✅ **All user visibility is controlled by:**
1. Logged-in user session (JWT)
2. RLS policies on views
3. `auth.uid()` in view definitions
4. No client-side viewer selection possible

✅ **No security bypass vectors:**
- No way for client to specify arbitrary `viewer_user_id`
- No unauthenticated REST endpoints
- All queries go through authenticated Supabase client

## Testing Recommendations

To verify the fix works:

1. **Clear browser cache and cookies**
2. **Log in with a user account**
3. **Open the sidebar and expand "Users"**
4. **Verify users list populates correctly**
5. **Check browser Network tab:**
   - Look for request to Supabase API
   - Verify `Authorization: Bearer ...` header is present
   - Check response returns user data (not empty array)

## Files Changed
- `app/components/ui/Sidebar.tsx` (2 lines changed)

## Status
🟢 **All user visibility queries are now properly authenticated**

