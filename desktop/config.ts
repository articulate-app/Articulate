/**
 * Desktop shell configuration.
 *
 * Development loads the local Next.js server.
 * Production loads the deployed Articulate web app (never localhost).
 */

/**
 * Fallback Desktop shell semver for unpackaged/dev runs.
 * Packaged builds prefer `app.getVersion()` from desktop/package.json.
 */
export const DESKTOP_VERSION_FALLBACK = "1.0.0"

/** Capability flags advertised to the web app via getInfo(). */
export const DESKTOP_CAPABILITIES = [
  "browser",
  "desktop_browser_provider",
  "agent_control",
  "auto_update",
  "native_webcontents_view",
] as const

export type DesktopCapability = (typeof DESKTOP_CAPABILITIES)[number]

/**
 * Injected at package time by `desktop/build.mjs` for release builds.
 * Example: https://app.whyarticulate.com/auth
 */
declare const __ARTICULATE_DESKTOP_PROD_URL__: string | undefined

const DEFAULT_DEV_URL = "http://127.0.0.1:3010/auth"
const DEFAULT_PROD_URL = "https://app.whyarticulate.com/auth"

export function resolveDesktopAppUrl(isPackaged: boolean): string {
  const override = process.env.ARTICULATE_DESKTOP_URL?.trim()
  if (override) return override

  if (!isPackaged) {
    return DEFAULT_DEV_URL
  }

  const injected =
    typeof __ARTICULATE_DESKTOP_PROD_URL__ !== "undefined"
      ? String(__ARTICULATE_DESKTOP_PROD_URL__).trim()
      : ""
  const fromEnv = process.env.ARTICULATE_DESKTOP_PROD_URL?.trim() || ""
  const prodUrl = injected || fromEnv || DEFAULT_PROD_URL

  if (!prodUrl || /localhost|127\.0\.0\.1/i.test(prodUrl)) {
    throw new Error(
      "[articulate-desktop] Production app URL is missing or points at localhost. " +
        "Set ARTICULATE_DESKTOP_PROD_URL at build time (e.g. https://app.whyarticulate.com/auth).",
    )
  }

  return prodUrl
}

export function resolveDesktopAppOrigin(appUrl: string): string {
  return new URL(appUrl).origin
}
