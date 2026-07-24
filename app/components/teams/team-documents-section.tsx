"use client"

import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { ChevronDown, ChevronLeft, Loader2, Plus } from "lucide-react"
import { DocumentsPage, type DocumentsPageHandle } from "../../screens/documents/DocumentsPage"
import { DocumentsUnifiedFilterBar } from "../documents/DocumentsUnifiedFilterBar"
import { Button } from "../ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu"
import { fetchDocumentsSummary } from "../../lib/services/documents"
import { DOCUMENTS_ALL_TIME_DATE_FROM } from "../../lib/services/documents-postgrest-rpc"
import { toast } from "../ui/use-toast"
import { cn } from "@/lib/utils"
import type { DocumentsFilters } from "../../lib/types/documents"

interface TeamDocumentsSectionProps {
  teamId: number
  teamName?: string
  /** Controlled expand mode for filling the parent modal. */
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  /** Hide title/back when parent modal header already shows them. */
  hideExpandedChrome?: boolean
  /** Optional team selector row under the Billing overview title. */
  overviewHeader?: ReactNode
}

function buildTeamDocumentsFilters(teamId: number): DocumentsFilters {
  const teamKey = String(teamId)
  return {
    q: "",
    direction: "",
    kind: [],
    status: [],
    currency: "",
    fromTeam: [teamKey],
    toTeam: [teamKey],
    fromDate: DOCUMENTS_ALL_TIME_DATE_FROM,
    toDate: "",
    projects: [],
  }
}

function formatCurrency(amount: number, currencyCode = "EUR"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function OverviewRow({
  label,
  value,
  muted = false,
}: {
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-gray-100 py-2.5 last:border-b-0">
      <div className={cn("text-sm", muted ? "text-gray-500" : "text-gray-900")}>{label}</div>
      <div
        className={cn(
          "shrink-0 text-sm tabular-nums",
          muted ? "text-gray-500" : "font-medium text-gray-900",
        )}
      >
        {value}
      </div>
    </div>
  )
}

function BillingOverview({
  teamId,
  filters,
  header,
}: {
  teamId: number
  filters: DocumentsFilters
  header?: ReactNode
}) {
  const { data: summary, isLoading, isError } = useQuery({
    queryKey: ["documents-summary-cards", { involvingTeamId: teamId, filters }],
    queryFn: () => fetchDocumentsSummary(filters),
    staleTime: 30_000,
  })

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-gray-900">Billing overview</h3>
        <p className="mt-1 text-sm text-gray-500">Account balance for this team.</p>
      </div>

      {header}

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : isError || !summary ? (
        <p className="py-4 text-sm text-gray-500">Unable to load billing overview.</p>
      ) : (
        <div>
          <OverviewRow label="Invoiced" value={formatCurrency(summary.invoiced)} />
          <OverviewRow label="Costs" value={formatCurrency(summary.costs)} />
          <OverviewRow label="AR credits" value={formatCurrency(summary.arCredit)} />
          <OverviewRow label="AP credits" value={formatCurrency(summary.apCredit)} />
          <OverviewRow label="Result" value={formatCurrency(summary.result)} />
          <OverviewRow label="Pending AR" value={formatCurrency(summary.pendingAR)} muted />
          <OverviewRow label="Pending AP" value={formatCurrency(summary.pendingAP)} muted />
          <OverviewRow label="Pending net" value={formatCurrency(summary.pendingNet)} muted />
        </div>
      )}
    </div>
  )
}

function BillingPlanSection() {
  const comingSoon = (label: string) => {
    toast({
      title: label,
      description: "This action is not available yet.",
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-gray-900">Billing plan</h3>
        <p className="mt-1 text-sm text-gray-500">Credits, auto-recharge, and plan controls.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => comingSoon("Add to credit balance")}>
          Add to credit balance
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => comingSoon("Auto recharge settings")}>
          Auto recharge settings
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-red-600 hover:bg-red-50 hover:text-red-700"
          onClick={() => comingSoon("Cancel plan")}
        >
          Cancel plan
        </Button>
      </div>
    </div>
  )
}

function DocumentsAddMenu({
  onAddInvoice,
  onAddPayment,
  onAddCreditNote,
}: {
  onAddInvoice: () => void
  onAddPayment: () => void
  onAddCreditNote: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 px-2.5">
          <Plus className="h-3.5 w-3.5" />
          Add
          <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[80]">
        <DropdownMenuItem onClick={onAddInvoice}>Invoice</DropdownMenuItem>
        <DropdownMenuItem onClick={onAddPayment}>Payment</DropdownMenuItem>
        <DropdownMenuItem onClick={onAddCreditNote}>Credit Note</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function BillingHistoryHeader({
  onBack,
  compact = false,
  addMenu,
  hideTitle = false,
}: {
  onBack?: () => void
  compact?: boolean
  addMenu?: ReactNode
  hideTitle?: boolean
}) {
  return (
    <div className="shrink-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="-ml-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              aria-label="Back"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          ) : null}
          {!hideTitle ? (
            <h3 className="text-sm font-medium text-gray-900">Billing history</h3>
          ) : null}
        </div>
        {addMenu}
      </div>
      {!compact && !hideTitle ? (
        <p className="mt-1 text-sm text-gray-500">
          Invoices, orders, payments, and credit notes involving this team.
        </p>
      ) : null}
    </div>
  )
}

function useInViewOnce<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [isInView, setIsInView] = useState(false)

  useEffect(() => {
    if (isInView) return
    const node = ref.current
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsInView(true)
          observer.disconnect()
        }
      },
      { root: null, rootMargin: "120px 0px", threshold: 0.01 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [isInView])

  return { ref, isInView }
}

/**
 * Team billing plan, overview, and document history for Settings → Billing.
 */
export function TeamDocumentsSection({
  teamId,
  teamName,
  expanded,
  onExpandedChange,
  hideExpandedChrome = false,
  overviewHeader,
}: TeamDocumentsSectionProps) {
  const [internalExpanded, setInternalExpanded] = useState(false)
  const [forceLoadPreview, setForceLoadPreview] = useState(false)
  const [overviewFilters, setOverviewFilters] = useState<DocumentsFilters>(() =>
    buildTeamDocumentsFilters(teamId),
  )
  const isHistoryExpanded = expanded ?? internalExpanded
  const { ref: previewRef, isInView: isPreviewInView } = useInViewOnce<HTMLDivElement>()
  const documentsRef = useRef<DocumentsPageHandle>(null)
  const pendingCreateActionRef = useRef<"invoice" | "payment" | "credit_note" | null>(null)
  const shouldLoadPreview = isPreviewInView || forceLoadPreview || overviewHeader != null

  useEffect(() => {
    setOverviewFilters(buildTeamDocumentsFilters(teamId))
  }, [teamId])

  const setExpanded = (next: boolean) => {
    if (expanded === undefined) setInternalExpanded(next)
    onExpandedChange?.(next)
  }

  const runCreateAction = (action: "invoice" | "payment" | "credit_note") => {
    const handle = documentsRef.current
    if (handle) {
      if (action === "invoice") handle.openCreateInvoice()
      if (action === "payment") handle.openCreatePayment()
      if (action === "credit_note") handle.openCreateCreditNote()
      return
    }
    pendingCreateActionRef.current = action
    setForceLoadPreview(true)
  }

  useEffect(() => {
    const action = pendingCreateActionRef.current
    const handle = documentsRef.current
    if (!action || !handle) return
    pendingCreateActionRef.current = null
    if (action === "invoice") handle.openCreateInvoice()
    if (action === "payment") handle.openCreatePayment()
    if (action === "credit_note") handle.openCreateCreditNote()
  }, [shouldLoadPreview, isHistoryExpanded])

  const clearOverviewFilters = () => {
    setOverviewFilters(buildTeamDocumentsFilters(teamId))
  }

  const overviewHeaderWithFilters = useMemo(() => {
    if (!overviewHeader) return null
    return (
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 py-2.5">
        <div className="text-sm text-gray-900">Team</div>
        <div className="flex min-w-0 items-center gap-1">
          {overviewHeader}
          <DocumentsUnifiedFilterBar
            filters={overviewFilters}
            onFiltersChange={setOverviewFilters}
            onClearAllFilters={clearOverviewFilters}
            compactFilters
            compactIconOnly
            showAddMenu={false}
            involvingTeamId={teamId}
          />
        </div>
      </div>
    )
  }, [overviewFilters, overviewHeader, teamId])

  const addMenu = (
    <DocumentsAddMenu
      onAddInvoice={() => runCreateAction("invoice")}
      onAddPayment={() => runCreateAction("payment")}
      onAddCreditNote={() => runCreateAction("credit_note")}
    />
  )

  if (isHistoryExpanded) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 px-6 py-5">
        <BillingHistoryHeader
          onBack={hideExpandedChrome ? undefined : () => setExpanded(false)}
          compact
          hideTitle={false}
          addMenu={addMenu}
        />
        <div className="min-h-0 flex-1">
          <DocumentsPage
            ref={documentsRef}
            embedded
            involvingTeamId={teamId}
            involvingTeamName={teamName}
            detailsAsModal
            hideFromColumn
            hideAddMenu
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <BillingOverview
        teamId={teamId}
        filters={overviewFilters}
        header={overviewHeaderWithFilters}
      />

      <div className="space-y-4 border-t border-gray-100 pt-6">
        <BillingPlanSection />
      </div>

      <div ref={previewRef} className="flex flex-col gap-3 border-t border-gray-100 pt-6">
        <BillingHistoryHeader addMenu={addMenu} />
        {shouldLoadPreview ? (
          <DocumentsPage
            ref={documentsRef}
            embedded
            involvingTeamId={teamId}
            involvingTeamName={teamName}
            detailsAsModal
            hideFromColumn
            hideAddMenu
            previewLimit={10}
            onSeeAll={() => setExpanded(true)}
          />
        ) : (
          <div className="flex h-24 items-center justify-center text-sm text-gray-400">
            Scroll to load billing history…
          </div>
        )}
      </div>
    </div>
  )
}
