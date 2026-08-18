import { BrowserUseProvider } from "./providers/browser-use.ts"
import type { BrowserAgentProvider, BrowserAgentProviderName } from "./types.ts"
import { BrowserAgentError } from "./types.ts"

export * from "./types.ts"
export { BrowserUseProvider } from "./providers/browser-use.ts"
export {
  BROWSER_CONTROLLER_COMMANDS,
  BROWSER_ERROR_CODES,
  BROWSER_INSPECT_COMMANDS,
  compactBrowserResult,
  desktopObservationToResult,
  emptyBrowserResult,
  isBrowserControllerCommand,
  type BrowserControllerCommand,
  type BrowserControllerInput,
  type BrowserControllerResult,
} from "./controller.ts"
export {
  filterVerifiedResourceUrls,
  isVerifiedPageHref,
  looksLikeCollectionOrSearchUrl,
  looksLikeSpecificResourceUrl,
  recommendBrowserFallback,
} from "./url-verification.ts"
/**
 * @deprecated LocalBridgeProvider is disconnected from runtime resolution.
 * The module remains for historical reference only — do not instantiate for new work.
 */
export { LocalBridgeProvider } from "./providers/local-bridge.ts"
export {
  resolveBrowserProvider,
  isLocalBrowserProvider,
  isDesktopBrowserProvider,
  isCloudBrowserProvider,
  type ResolveBrowserProviderInput,
  type ResolvedBrowserProvider,
  type LocalBridgeStatusInput,
  type BrowserProviderOperation,
} from "./resolve-browser-provider.ts"

export type CreateBrowserProviderOptions = {
  provider?: BrowserAgentProviderName | string | null
  apiKey?: string | null
  baseUrl?: string | null
  defaultModel?: string | null
  fetchImpl?: typeof fetch
}

/**
 * Factory for server-side browser runtime providers.
 *
 * `articulate_desktop` is client-driven (Electron main process) — it is not
 * instantiated on the edge. Callers must treat it as a pending-desktop response.
 *
 * `browser_use_local` is legacy and throws — do not create new local-bridge sessions.
 */
export function createBrowserProvider(
  options: CreateBrowserProviderOptions = {},
): BrowserAgentProvider {
  const name = String(options.provider ?? "browser_use").trim() || "browser_use"
  if (name === "browser_use") {
    const apiKey = String(options.apiKey ?? "").trim()
    return new BrowserUseProvider({
      apiKey,
      baseUrl: options.baseUrl ?? undefined,
      defaultModel: options.defaultModel ?? undefined,
      fetchImpl: options.fetchImpl,
    })
  }
  if (name === "articulate_desktop") {
    throw new BrowserAgentError(
      "provider_client_driven",
      "Desktop browser is controlled by Articulate Desktop (Electron), not the edge runtime.",
      { provider: "articulate_desktop" },
    )
  }
  if (name === "browser_use_local") {
    throw new BrowserAgentError(
      "provider_legacy",
      "Local Browser Bridge is deprecated and disconnected from runtime. Use Desktop or Cloud.",
      { provider: "browser_use_local" },
    )
  }
  throw new BrowserAgentError(
    "provider_unsupported",
    `Browser provider "${name}" is not implemented`,
    { provider: name as BrowserAgentProviderName },
  )
}

/** @deprecated Use createBrowserProvider. */
export const createBrowserAgentProvider = createBrowserProvider
/** @deprecated Use CreateBrowserProviderOptions. */
export type CreateBrowserAgentProviderOptions = CreateBrowserProviderOptions
