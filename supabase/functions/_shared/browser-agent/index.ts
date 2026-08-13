import { BrowserUseProvider } from "./providers/browser-use.ts"
import { LocalBridgeProvider } from "./providers/local-bridge.ts"
import type { BrowserAgentProvider, BrowserAgentProviderName } from "./types.ts"
import { BrowserAgentError } from "./types.ts"

export * from "./types.ts"
export { BrowserUseProvider } from "./providers/browser-use.ts"
export { LocalBridgeProvider } from "./providers/local-bridge.ts"
export {
  resolveBrowserProvider,
  isLocalBrowserProvider,
  type ResolveBrowserProviderInput,
  type ResolvedBrowserProvider,
  type LocalBridgeStatusInput,
  type BrowserProviderOperation,
} from "./resolve-browser-provider.ts"

export type CreateBrowserAgentProviderOptions = {
  provider?: BrowserAgentProviderName | string | null
  apiKey?: string | null
  baseUrl?: string | null
  defaultModel?: string | null
  fetchImpl?: typeof fetch
}

export function createBrowserAgentProvider(
  options: CreateBrowserAgentProviderOptions = {},
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
  if (name === "browser_use_local") {
    return new LocalBridgeProvider()
  }
  throw new BrowserAgentError(
    "provider_unsupported",
    `Browser agent provider "${name}" is not implemented in this MVP`,
    { provider: name as BrowserAgentProviderName },
  )
}
