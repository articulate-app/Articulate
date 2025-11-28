/**
 * Types for admin user creation via Edge Function
 */

export type AdminCreateUserPayload = {
  email: string;
  full_name?: string;
  team_id?: number | null;
  role_id?: number | null;
  send_invite?: boolean;
};

export type AdminCreateUserResponse = {
  auth_user_id: string;
  public_user_id: number;
  email: string;
  full_name: string | null;
  team_id: number | null;
  role_id: number | null;
};

