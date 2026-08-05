/**
 * Connect Google (GSC/GA) in the main product UI.
 * Set NEXT_PUBLIC_GOOGLE_OAUTH_CONNECT_ENABLED=false to hide during verification
 * if you need to avoid unverified-scope traffic.
 */
export function isGoogleOAuthConnectEnabledInMainUi(): boolean {
  return process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CONNECT_ENABLED !== "false"
}

export const GOOGLE_OAUTH_DEMO_PATH = "/integrations/google-oauth-demo" as const
