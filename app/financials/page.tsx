import { redirect } from 'next/navigation'

/**
 * Financials now lives in Settings → Billing (unified shell).
 * Keep this route as a deep-link alias into billing settings.
 */
export default function FinancialsRoute() {
  redirect('/?settings=open&settingsCategory=billing')
}
