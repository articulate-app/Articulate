# Expenses Section Implementation

## Overview

This document outlines the implementation of the Expenses section (Accounts Payable) that mirrors the existing Invoices/Payments UX. The implementation follows the same patterns and reuses existing components for consistency.

## What's Been Implemented

### 1. Core Structure
- **Layout**: `/app/expenses/layout.tsx` - Navigation with three tabs
- **Main Page**: `/app/expenses/page.tsx` - Redirects to supplier invoices
- **Types**: `/app/lib/types/expenses.ts` - Complete type definitions
- **Services**: `/app/lib/services/expenses.ts` - Data fetching and business logic

### 2. Supplier Invoices
- **Page**: `/app/expenses/supplier-invoices/page.tsx`
- **List Page**: `/app/components/expenses/SupplierInvoicesListPage.tsx`
- **Table**: `/app/components/expenses/SupplierInvoicesTable.tsx`
- **Filters**: `/app/components/expenses/SupplierInvoicesFilters.tsx`
- **Details Pane**: `/app/components/expenses/SupplierInvoiceDetailsPane.tsx`
- **Allocation Panel**: `/app/components/expenses/InvoiceAllocateToOrdersPanel.tsx`

### 3. Supplier Payments
- **Page**: `/app/expenses/supplier-payments/page.tsx`
- **List Page**: `/app/components/expenses/SupplierPaymentsListPage.tsx`
- **Table**: `/app/components/expenses/SupplierPaymentsTable.tsx`

### 4. Supplier Credit Notes
- **Page**: `/app/expenses/supplier-credit-notes/page.tsx`
- **List Page**: `/app/components/expenses/SupplierCreditNotesListPage.tsx`

## Key Features Implemented

### Role-Based Visibility
- User role checking via `teams_users` table
- Permission derivation for different user types:
  - **Admins (role 3)**: Full access everywhere
  - **Payer teams (roles 7/8/9)**: Full access to AP tabs and actions
  - **Externals (role 1)**: Limited access based on team ownership

### Infinite Lists
- Reuses existing `InfiniteList` component
- Proper query key management for cache invalidation
- Optimistic updates for all CRUD operations

### URL State Management
- Filters and sort state persisted in URL
- Deep linking support for selected items
- Proper hydration handling

### Invoice → Production Order Allocations
- Complete allocation panel implementation
- Search and select production orders
- Real-time validation and error handling
- Optimistic updates with rollback on error

## Data Sources Used

### Views
- `v_received_invoices_list` - Supplier invoices with calculated fields
- `v_supplier_payments_summary` - Payment summaries with allocation data
- `v_received_credit_notes_summary` - Credit note summaries

### Tables
- `received_supplier_invoices` - Invoice details
- `supplier_payments` - Payment details
- `received_credit_notes` - Credit note details
- `received_invoice_allocations` - Invoice ↔ Production Order allocations

### RPC Functions
- `create_supplier_payment_with_allocations` - Payment creation with allocations

## What Still Needs Implementation

### 1. Supplier Payments
- **Payment Creation**: Right-pane form for creating payments with multi-invoice allocations
- **Payment Details Pane**: Complete details view with allocation management
- **Payment Filters**: Complete filter implementation

### 2. Supplier Credit Notes
- **Credit Notes Table**: Complete table implementation with infinite list
- **Credit Note Creation**: Modal for creating credit notes
- **Credit Note Details Pane**: Complete details view
- **Credit Note Filters**: Complete filter implementation

### 3. General Improvements
- **Team Selection**: Fetch and populate team options in filters
- **Payment Methods**: Define and use payment method options
- **Currency Options**: Fetch from database instead of hardcoded
- **Error Handling**: More comprehensive error handling and user feedback
- **Loading States**: Better loading indicators and skeleton screens

### 4. Advanced Features
- **Bulk Operations**: Bulk actions for invoices, payments, and credit notes
- **Export Functionality**: Export data to CSV/Excel
- **Advanced Filtering**: More sophisticated filter options
- **Real-time Updates**: WebSocket integration for live updates

## Usage

### Navigation
The expenses section is accessible via the main navigation and provides three tabs:
1. **Supplier Invoices** - Manage received supplier invoices
2. **Supplier Payments** - Manage payments to suppliers
3. **Supplier Credit Notes** - Manage credit notes for supplier invoices

### Role-Based Access
- **Admins**: Full access to all features
- **Payer Teams**: Can create payments, manage allocations, edit invoices
- **External Suppliers**: Can view their invoices, create credit notes, manage allocations

### Key Interactions
1. **Invoice Selection**: Click on any invoice row to open details pane
2. **Allocation Management**: Use the "Allocate to Orders" panel in invoice details
3. **Payment Creation**: Use the create button in the payments tab
4. **Filtering**: Use the filter button to apply various filters
5. **Search**: Use the search bar for quick text-based filtering

## Technical Notes

### State Management
- Uses React Query for server state management
- Local state for UI interactions
- URL state for navigation and persistence

### Performance
- Infinite scrolling for large datasets
- Debounced search (300ms)
- Optimistic updates for better UX
- Proper cache invalidation

### Security
- Role-based access control
- Server-side validation via RLS
- Client-side permission checks for UI elements

## Next Steps

1. Complete the payment creation flow
2. Implement credit note management
3. Add comprehensive error handling
4. Implement real-time updates
5. Add bulk operations
6. Add export functionality
7. Improve loading states and user feedback 