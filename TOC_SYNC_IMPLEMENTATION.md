# TOC Invoice Sync Implementation

## Overview
This implementation provides automatic syncing of invoices with TOC Online immediately after invoice creation, as requested. The system works for actions originating from both `/invoices` and `/invoice-orders` pages.

## Components Implemented

### 1. Core Sync Function (`app/lib/services/billing.ts`)

**`syncInvoiceWithTOC(invoiceId: number)`**
- Calls the existing `toc_invoice` edge function with the required payload: `{ "invoice_id": <ID> }`
- Handles errors gracefully and updates the `api_response` column
- Returns success/error status for logging

**`retrySyncInvoiceWithTOC(invoiceId: number)`**
- Manual trigger for TOC sync (useful for retries)
- Wrapper around the main sync function with additional logging

**`getInvoiceTOCSyncStatus(invoiceId: number)`**
- Checks the sync status by reading the `api_response` column
- Returns structured status information (synced, error, timestamp)

### 2. Automatic Integration

The following functions now automatically trigger TOC sync after successful invoice creation:

**`createAndIssueInvoice()`** - Used by:
- `CreateAndIssueInvoiceModal`
- Various invoice creation workflows

**`createAndIssueInvoiceRPC()`** - Used by:
- `InvoiceAllocationModal`
- New invoice creation flows

### 3. UI Components (`app/components/billing/IssuedInvoiceDetail.tsx`)

**`TOCSyncStatusIndicator`**
- Real-time display of TOC sync status
- Auto-refreshes every 30 seconds to catch background syncs
- Shows different states:
  - ✅ Successfully synced (with timestamp)
  - ❌ Sync failed (with retry button and error message)
  - ⚠️ Not synced (with manual sync button)
  - 🔄 Loading/checking status

## Key Features

### Immediate Sync
- TOC sync happens immediately after invoice creation
- Uses "fire and forget" pattern - doesn't block UI
- Users see immediate feedback while sync happens in background

### Error Handling
- All errors are logged to console
- Failed syncs update the `api_response` column with error details
- UI provides retry functionality for failed syncs
- No silent failures

### Real-time Updates
- Users can see the updated invoice status in real time
- Status indicator auto-refreshes to catch background sync completion
- Manual retry option for failed syncs

### Cross-page Compatibility
- Works for invoice creation from `/invoices` page
- Works for invoice creation from `/invoice-orders` page
- All existing invoice creation workflows are covered

## Database Integration

The implementation uses the existing `issued_client_invoices.api_response` column to store:
- Success status with sync timestamp and TOC data
- Error details for failed syncs
- Structured JSON format for easy querying

## Testing

To test the implementation:
1. Create an invoice from either the invoices or invoice-orders page
2. Check the console for sync logs
3. View the invoice detail to see the TOC sync status
4. For failed syncs, use the retry button
5. Check the `api_response` column in the database

## Edge Function Compatibility

The implementation correctly interfaces with the existing `toc_invoice` edge function:
- Sends proper authentication headers
- Uses correct payload format: `{ "invoice_id": <ID> }`
- Handles edge function responses appropriately

## Performance Considerations

- Background sync doesn't block user interactions
- Status checks are optimized with React Query caching
- Auto-refresh interval is set to 30 seconds (configurable)
- No impact on existing invoice creation performance
