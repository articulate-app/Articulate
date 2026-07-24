-- Soft-deleted project watchers must not appear in membership lists.

CREATE OR REPLACE VIEW public.view_project_watchers_i_can_see AS
 SELECT pw.id,
    pw.project_id,
    pw.user_id,
    pw.is_deleted,
    pw.created_at,
    pw.updated_at,
    pw.synced_at
   FROM project_watchers pw
     JOIN users u_target ON u_target.id = pw.user_id
     JOIN projects p ON p.id = pw.project_id
  WHERE u_target.active = true
    AND coalesce(pw.is_deleted, false) = false
    AND (EXISTS (
      SELECT 1
      FROM users u
        JOIN teams_users tu ON tu.user_id = u.id
      WHERE u.auth_user_id = auth.uid()
        AND (
          tu.role_id = 1 AND u.id = pw.user_id
          OR tu.role_id = 2 AND (EXISTS (
            SELECT 1
            FROM project_watchers pw_self
            WHERE pw_self.project_id = pw.project_id
              AND pw_self.user_id = u.id
              AND coalesce(pw_self.is_deleted, false) = false
          ))
          OR tu.role_id = 3
          OR (tu.role_id = ANY (ARRAY[6, 7, 8, 9])) AND p.team_id = tu.team_id
        )
    ));

COMMENT ON VIEW public.view_project_watchers_i_can_see IS
  'Project watchers visible to the current user; excludes soft-deleted rows.';
