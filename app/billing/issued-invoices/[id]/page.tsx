import { Suspense } from 'react'
import IssuedInvoiceDetail from '../../../components/billing/IssuedInvoiceDetail'

// Disable static generation for this page
export const dynamic = 'force-dynamic'

interface IssuedInvoicePageProps {
  params: {
    id: string
  }
}

export default function IssuedInvoicePage({ params }: IssuedInvoicePageProps) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <IssuedInvoiceDetail id={parseInt(params.id)} />
    </Suspense>
  )
} 