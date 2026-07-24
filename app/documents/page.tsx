import { redirect } from 'next/navigation'

/** Documents / billing history live in Settings → Billing. */
export default function DocumentsRoute() {
  redirect('/?settings=open&settingsCategory=billing')
}
