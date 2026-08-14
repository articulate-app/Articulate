/**
 * @deprecated Local Browser Bridge agent control.
 * Re-exports Desktop control epoch helpers. Local Bridge is disconnected from runtime.
 */
export {
  getDesktopBrowserControlGeneration as getLocalBrowserControlGeneration,
  bumpDesktopBrowserHumanControl as bumpLocalBrowserHumanControl,
  beginDesktopBrowserAgentRun as beginLocalBrowserAgentRun,
  isDesktopBrowserAgentGenerationCurrent as isLocalBrowserAgentGenerationCurrent,
  DesktopBrowserAgentCancelledError as LocalBrowserAgentCancelledError,
  getDesktopBrowserControlGeneration,
  bumpDesktopBrowserHumanControl,
  beginDesktopBrowserAgentRun,
  isDesktopBrowserAgentGenerationCurrent,
  DesktopBrowserAgentCancelledError,
} from "./desktop-browser-agent-control"
