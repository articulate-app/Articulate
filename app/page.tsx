import { UnifiedShellPage } from "./components/shell/UnifiedShellPage"

// Disable static generation for the shell page.
export const dynamic = "force-dynamic"

export default function HomePage() {
  return <UnifiedShellPage />
}