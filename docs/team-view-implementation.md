# Team View Implementation

## Overview

This document describes the comprehensive Team view implementation that allows users to manage teams, their members, projects, billing information, and view team activity.

## Architecture

### Service Layer

**Location**: `app/lib/services/teams.ts`

The service layer provides a clean abstraction over Supabase operations with the following functions:

#### Team Profile
- `getTeamProfile(teamId)` - Get team profile with member and project counts from `v_team_profile`
- `updateTeam(teamId, patch)` - Update basic team info (title, full_name, description, logo, active)
- `updateTeamBilling(teamId, billing)` - Update team billing information

#### Team Members
- `getTeamMembers(teamId)` - Get team members with roles from `v_user_teams_i_can_see`
- `getTeamMembersWithDetails(teamId)` - Get members enriched with user details (name, email, photo)
- `addUserToTeam(userId, teamId, roleId)` - Add user to team with specific role via `fn_add_user_to_team`
- `removeUserFromTeam(userId, teamId)` - Remove user from team via `fn_remove_user_from_team`

#### Team Projects
- `getTeamProjects(teamId)` - Get all projects assigned to team
- `addProjectToTeam(teamId, projectId)` - Assign project to team via `fn_add_project_to_team`
- `removeProjectFromTeam(teamId, projectId)` - Remove project from team via `fn_remove_project_from_team`

#### Team Activity
- `getTeamActivity(teamId, limit, offset)` - Get team activity via `fn_list_team_activity`

#### Team Chat
- `getOrCreateTeamThread(teamId)` - Get or create team chat thread via `fn_get_or_create_team_thread`

#### Utilities
- `getRoles()` - Get all available roles
- `getAvailableUsers(search)` - Get users available for adding to team
- `getAvailableProjects(search)` - Get projects available for adding to team

### UI Components

**Location**: `app/components/teams/TeamDetailsPage.tsx`

The main component is split into sub-components for each tab:

#### TeamDetailsPage (Main)
- Handles overall layout and tab navigation
- Manages "Team Chat" button in header
- Coordinates routing via URL search params

#### TeamOverviewTab
- Displays and allows editing of basic team info
- Shows team logo/avatar, title, full name, description
- Displays creation and update timestamps
- Inline editing with save/cancel functionality

#### TeamMembersTab
- Lists all team members with user details
- Shows member roles with inline role editing
- "Add Member" dialog with user search and role selection
- Remove member confirmation dialog
- Displays "App Access" badge for members with app access

#### TeamProjectsTab
- Lists all projects assigned to team
- Shows project color, name, status, and due date
- "Add Project" dialog with project search
- Remove project confirmation dialog
- Click project to navigate to project details

#### TeamBillingTab
- Editable form for all billing fields:
  - Business name
  - VAT number
  - Invoice provider
  - Address (line 1, line 2, city, postcode, region, country code)
- Inline editing with save/cancel functionality
- Mirrors project billing form UX

#### TeamActivityTab
- Shows activity feed from all team projects
- Displays project name with color chip
- Shows action, details, and timestamp
- Links to tasks if task_id present
- "Load More" button for pagination

### Page Integration

**Location**: `app/teams/[id]/page.tsx`

The team page integrates:
- Left pane: Sidebar with team navigation
- Middle pane: TeamDetailsPage component
- Right pane: ThreadedRealtimeChat (when chat is opened)

Routing is handled via URL search params:
- `tab` - Active tab in TeamDetailsPage (overview, members, projects, billing, activity)
- `rightView=thread-chat` - Opens right pane with chat
- `rightThreadId` - Thread ID for chat

## Database Schema Reference

### Tables Used

1. **teams** - Core team table with all team fields including billing
2. **teams_users** - Junction table linking users to teams with roles
3. **roles** - Available roles that can be assigned to team members
4. **projects** - Projects table with team_id foreign key
5. **project_activity_logs** - Activity logs for team projects
6. **threads** - Chat threads with team_id support
7. **mentions** - Messages within threads

### Views Used

1. **v_team_profile** - Team profile with member and project counts
2. **v_user_teams_i_can_see** - Team members with roles (RLS filtered)
3. **v_users_minimal_i_can_see** - Available users for adding to teams
4. **v_projects_minimal** - Available projects for adding to teams
5. **v_team_activity** - Team activity aggregated from project logs

### RPCs Used

1. **fn_add_user_to_team(p_user_id, p_team_id, p_role_id)** - Add or update user team membership
2. **fn_remove_user_from_team(p_user_id, p_team_id)** - Remove user from team
3. **fn_add_project_to_team(p_team_id, p_project_id)** - Assign project to team
4. **fn_remove_project_from_team(p_team_id, p_project_id)** - Remove project from team
5. **fn_list_team_activity(p_team_id, p_limit, p_offset)** - Get paginated activity
6. **fn_get_or_create_team_thread(p_team_id)** - Get or create team chat thread

## Features Implemented

### ✅ Basic Team Info
- View team logo, title, full name, description
- View member count and project count
- Edit team info inline with save/cancel
- Logo URL support (or default colored avatar)
- Created and updated timestamps

### ✅ Team Members Management
- List all members with user details (photo, name, email)
- Show role for each member
- Add new members with user search and role selection
- Edit member roles inline (dropdown)
- Remove members with confirmation
- Display "App Access" badge

### ✅ Team Projects Management
- List all projects assigned to team
- Show project color, name, status, due date
- Add projects with search
- Remove projects with confirmation
- Click project to navigate to details

### ✅ Team Billing
- View and edit all billing fields
- Business name, VAT number, invoice provider
- Complete address (line 1, line 2, city, postcode, region, country)
- Inline editing with save/cancel
- Form validation and error handling

### ✅ Team Activity Feed
- Display activity from all team projects
- Project name with color chip
- Action description and details
- Relative timestamps (e.g., "2 hours ago")
- Link to task details if available
- Pagination with "Load More"

### ✅ Team Chat
- "Team Chat" button in header
- Opens right pane with threaded chat
- Reuses existing ThreadedRealtimeChat component
- Supports mentions, replies, attachments
- Real-time updates via Supabase realtime

## User Experience

### Navigation Flow

1. User clicks team in sidebar → navigates to `/teams/[id]`
2. Team details page loads with "overview" tab active
3. User can switch between tabs (overview, members, projects, billing, activity)
4. User can click "Team Chat" to open chat in right pane
5. Right pane can be closed with X button
6. URLs are shareable (preserve tab and right pane state)

### Data Loading

- Team profile loads first (shows header immediately)
- Each tab loads its data independently when activated
- Optimistic updates for better UX (members, projects)
- Error handling with toast notifications
- Loading states for all async operations

### Editing Patterns

1. **Inline Edit** (Overview, Billing)
   - Click "Edit" button
   - Form fields become editable
   - "Save" commits changes, "Cancel" reverts
   - Loading state during save

2. **Modal Add** (Members, Projects)
   - Click "Add" button
   - Modal opens with search and selection
   - Submit adds item with optimistic update
   - Modal closes on success

3. **Dropdown Edit** (Member roles)
   - Role dropdown allows direct editing
   - Change triggers immediate update
   - Loading state during update

4. **Confirmation Remove** (Members, Projects)
   - Click remove icon
   - Confirmation dialog appears
   - Confirm removes item with optimistic update

## Integration with Existing Systems

### Routing
- Compatible with existing left/middle/right pane routing pattern
- Uses URL search params for state management
- Integrates with sidebar team navigation

### Chat System
- Reuses `ThreadedRealtimeChat` component
- Uses existing thread infrastructure
- RPC creates thread linked to team_id

### Styling
- Uses shadcn/ui components (Button, Card, Dialog, etc.)
- Tailwind CSS for styling
- Consistent with existing design system
- Responsive layout (mobile-first)

### Data Fetching
- TanStack React Query for data fetching
- Automatic cache management
- Query invalidation after mutations
- Error handling with toast notifications

## Testing Checklist

- [ ] Navigate to team from sidebar
- [ ] View team profile (logo, name, counts)
- [ ] Edit team basic info (save and cancel)
- [ ] Switch between tabs
- [ ] View team members list
- [ ] Add new member with role
- [ ] Edit member role
- [ ] Remove member
- [ ] View team projects list
- [ ] Add project to team
- [ ] Remove project from team
- [ ] Click project to navigate
- [ ] Edit billing information
- [ ] View team activity feed
- [ ] Load more activity items
- [ ] Click activity task link
- [ ] Open team chat
- [ ] Send message in team chat
- [ ] Close right pane
- [ ] Verify URL state persistence
- [ ] Test error scenarios (network errors, invalid data)

## Future Enhancements

Possible future improvements:

1. **Team Settings**
   - Team visibility/privacy settings
   - Team permissions configuration
   - Notification preferences

2. **Advanced Member Management**
   - Bulk add members (CSV import)
   - Member invitation via email
   - Member deactivation (vs removal)

3. **Project Analytics**
   - Team project statistics
   - Project completion rates
   - Resource allocation charts

4. **Activity Filters**
   - Filter by project
   - Filter by user
   - Filter by action type
   - Date range filtering

5. **Team Templates**
   - Save team structure as template
   - Quick team setup from template
   - Role presets

## Troubleshooting

### Common Issues

**Issue**: Members not showing names
- **Cause**: v_users_minimal_i_can_see may not include user
- **Solution**: Check user visibility and RLS policies

**Issue**: Projects not appearing in add dialog
- **Cause**: Projects already in team are filtered out
- **Solution**: Remove project first, then re-add

**Issue**: Chat not opening
- **Cause**: RPC permission or thread creation failed
- **Solution**: Check fn_get_or_create_team_thread RPC and permissions

**Issue**: Activity feed empty
- **Cause**: No project_activity_logs for team projects
- **Solution**: Ensure projects have activity logs

## Performance Considerations

1. **Data Fetching**
   - Views are optimized with proper indexing
   - RPCs use efficient queries
   - Pagination for activity feed

2. **Caching**
   - React Query caches all requests
   - Cache invalidation on mutations
   - Background refetching for freshness

3. **Rendering**
   - Tab content only renders when active
   - Virtualization not needed (reasonable list sizes)
   - Memoization for expensive computations

## Security

1. **Row Level Security (RLS)**
   - All views respect RLS policies
   - Users only see teams they can access
   - RPCs enforce security checks

2. **Permission Checks**
   - Backend validates all operations
   - Frontend shows appropriate UI based on permissions
   - Error messages don't leak sensitive data

3. **Data Validation**
   - Input validation on frontend
   - Backend validation in RPCs
   - SQL injection prevention via parameterized queries

