import { Suspense } from 'react'
import { CreditNoteDetailsPane } from '../../../components/credit-notes/CreditNoteDetailsPane'

// Disable static generation for this page
export const dynamic = 'force-dynamic'

interface CreditNotePageProps {
  params: {
    id: string
  }
}

export default function CreditNotePage({ params }: CreditNotePageProps) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CreditNoteDetailsPane
        creditNoteId={parseInt(params.id)}
        onClose={() => {}}
        onCreditNoteUpdate={() => {}}
        onCreditNoteDelete={() => {}}
      />
    </Suspense>
  )
} 