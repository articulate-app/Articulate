import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listPayments, getPaymentSummary, buildPaymentTrailingQuery } from '../app/lib/payments'
import type { PaymentSortConfig, PaymentFilters } from '../app/lib/types/billing'

// Mock Supabase client
const mockQuery = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  range: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  lte: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  or: vi.fn().mockReturnThis(),
}

const mockSupabase = {
  from: vi.fn().mockReturnValue(mockQuery)
}

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createClientComponentClient: () => mockSupabase
}))

describe('Payment ID Usage Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listPayments', () => {
    it('uses explicit columns instead of wildcard', async () => {
      mockQuery.select.mockResolvedValue({ data: [], count: 0, error: null })

      await listPayments({})

      expect(mockSupabase.from).toHaveBeenCalledWith('v_client_payments_summary')
      expect(mockQuery.select).toHaveBeenCalledWith(
        'payment_id,payer_team_id,payer_team_name,payment_date,payment_amount,payment_currency,method,external_ref,notes,amount_allocated,unallocated_amount,is_overallocated,created_at,updated_at',
        { count: 'exact' }
      )
    })

    it('orders by payment_id instead of id when sorting by payment_date', async () => {
      mockQuery.select.mockResolvedValue({ data: [], count: 0, error: null })

      const sort: PaymentSortConfig = { field: 'payment_date', direction: 'desc' }
      await listPayments({ sort })

      expect(mockQuery.order).toHaveBeenCalledWith('payment_date', { ascending: false })
      expect(mockQuery.order).toHaveBeenCalledWith('payment_id', { ascending: true })
    })

    it('default sorting uses payment_id instead of id', async () => {
      mockQuery.select.mockResolvedValue({ data: [], count: 0, error: null })

      await listPayments({})

      expect(mockQuery.order).toHaveBeenCalledWith('payment_date', { ascending: false })
      expect(mockQuery.order).toHaveBeenCalledWith('payment_id', { ascending: false })
    })

    it('does not include "id" in any order() calls', async () => {
      mockQuery.select.mockResolvedValue({ data: [], count: 0, error: null })

      await listPayments({})

      const orderCalls = mockQuery.order.mock.calls
      const hasIdOrder = orderCalls.some(call => call[0] === 'id')
      expect(hasIdOrder).toBe(false)
    })
  })

  describe('getPaymentSummary', () => {
    it('uses explicit columns instead of wildcard', async () => {
      mockQuery.single.mockResolvedValue({ data: null, error: null })

      await getPaymentSummary(123)

      expect(mockSupabase.from).toHaveBeenCalledWith('v_client_payments_summary')
      expect(mockQuery.select).toHaveBeenCalledWith(
        'payment_id,payer_team_id,payer_team_name,payment_date,payment_amount,payment_currency,method,external_ref,notes,amount_allocated,unallocated_amount,is_overallocated,created_at,updated_at'
      )
    })

    it('filters by payment_id instead of id', async () => {
      mockQuery.single.mockResolvedValue({ data: null, error: null })

      await getPaymentSummary(456)

      expect(mockQuery.eq).toHaveBeenCalledWith('payment_id', 456)
    })
  })

  describe('buildPaymentTrailingQuery', () => {
    it('uses payment_id in order clauses instead of id', () => {
      const filters: PaymentFilters = {
        dateFrom: undefined,
        dateTo: undefined,
        currency: [],
        method: [],
        payerTeamId: [],
        search: ''
      }
      const sort: PaymentSortConfig = { field: 'payment_date', direction: 'desc' }

      const trailingQueryFn = buildPaymentTrailingQuery(filters, sort)
      const result = trailingQueryFn(mockQuery)

      expect(mockQuery.order).toHaveBeenCalledWith('payment_date', { ascending: false })
      expect(mockQuery.order).toHaveBeenCalledWith('payment_id', { ascending: true })
    })

    it('does not use "id" in trailing query orders', () => {
      const filters: PaymentFilters = {
        dateFrom: undefined,
        dateTo: undefined,
        currency: [],
        method: [],
        payerTeamId: [],
        search: ''
      }
      const sort: PaymentSortConfig = { field: 'payment_date', direction: 'asc' }

      const trailingQueryFn = buildPaymentTrailingQuery(filters, sort)
      trailingQueryFn(mockQuery)

      const orderCalls = mockQuery.order.mock.calls
      const hasIdOrder = orderCalls.some(call => call[0] === 'id')
      expect(hasIdOrder).toBe(false)
    })
  })

  describe('PaymentSummary interface compliance', () => {
    it('PaymentSummary should have payment_id not id', () => {
      // This test documents the expected structure
      const validPaymentSummary = {
        payment_id: 123,
        payer_team_id: 15,
        payer_team_name: 'Test Team',
        payment_date: '2025-01-15',
        payment_amount: 100.00,
        payment_currency: 'EUR',
        method: 'bank_transfer',
        external_ref: 'ABC-123',
        notes: 'Test payment',
        amount_allocated: 50.00,
        unallocated_amount: 50.00,
        is_overallocated: false,
        created_at: '2025-01-15T10:00:00Z',
        updated_at: '2025-01-15T10:00:00Z'
      }

      // Should have payment_id
      expect(validPaymentSummary.payment_id).toBe(123)
      
      // Should NOT have id property
      expect('id' in validPaymentSummary).toBe(false)
    })
  })

  describe('URL and query parameter handling', () => {
    it('should use payment_id for row keys in components', () => {
      // This test documents the expected behavior for component keys
      const mockPayments = [
        { payment_id: 1, payment_date: '2025-01-01', payment_amount: 100 },
        { payment_id: 2, payment_date: '2025-01-02', payment_amount: 200 }
      ]

      // Component should use payment_id for keys, not id
      mockPayments.forEach(payment => {
        expect(payment.payment_id).toBeDefined()
        expect('id' in payment).toBe(false)
      })
    })

    it('should map payment_id to id when feeding generic table components', () => {
      // Test the mapping pattern for components that expect 'id'
      const paymentSummary = {
        payment_id: 789,
        payer_team_id: 15,
        payment_date: '2025-01-15',
        payment_amount: 100.00,
        payment_currency: 'EUR'
      }

      // Map payment_id to id for generic components
      const mappedForGenericTable = {
        ...paymentSummary,
        id: paymentSummary.payment_id
      }

      expect(mappedForGenericTable.id).toBe(789)
      expect(mappedForGenericTable.payment_id).toBe(789)
    })
  })
}) 