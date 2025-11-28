import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPayment, type CreatePaymentArgs, type Allocation } from '../app/lib/payments'

// Mock Supabase client
const mockRpc = vi.fn()
const mockAuth = {
  getUser: vi.fn()
}

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createClientComponentClient: () => ({
    rpc: mockRpc,
    auth: mockAuth
  })
}))

describe('createPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const baseArgs: CreatePaymentArgs = {
    payerTeamId: 15,
    receivedByUserId: 60,
    paymentDate: '2025-01-15',
    amount: 100.00,
    currency: 'EUR',
    method: 'bank_transfer',
    externalRef: 'ABC-123',
    notes: 'Test payment'
  }

  it('Case A: allocations omitted → passes [] and succeeds', async () => {
    mockRpc.mockResolvedValue({ data: 12345, error: null })

    const args = { ...baseArgs }
    const result = await createPayment(args)

    expect(result.data).toBe(12345)
    expect(result.error).toBeNull()
    
    // Verify RPC was called with correct parameters
    expect(mockRpc).toHaveBeenCalledWith('create_client_payment_with_allocations', {
      p_payer_team_id: 15,
      p_received_by_user_id: 60,
      p_payment_date: '2025-01-15',
      p_amount: '100',
      p_payment_currency: 'EUR',
      p_method: 'bank_transfer',
      p_exchange_rate_note: null,
      p_external_ref: 'ABC-123',
      p_notes: 'Test payment',
      p_allocations: [] // <-- Empty array, NOT string
    })
  })

  it('Case B: single object passed → wraps to array, succeeds', async () => {
    mockRpc.mockResolvedValue({ data: 12346, error: null })

    const singleAllocation: Allocation = {
      issued_invoice_id: 1234,
      amount_applied: 50.00
    }

    const args = { ...baseArgs, allocations: singleAllocation }
    const result = await createPayment(args)

    expect(result.data).toBe(12346)
    expect(result.error).toBeNull()
    
    // Verify single allocation was wrapped in array
    expect(mockRpc).toHaveBeenCalledWith('create_client_payment_with_allocations', {
      p_payer_team_id: 15,
      p_received_by_user_id: 60,
      p_payment_date: '2025-01-15',
      p_amount: '100',
      p_payment_currency: 'EUR',
      p_method: 'bank_transfer',
      p_exchange_rate_note: null,
      p_external_ref: 'ABC-123',
      p_notes: 'Test payment',
      p_allocations: [singleAllocation] // <-- Wrapped in array
    })
  })

  it('Case C: array passed → succeeds', async () => {
    mockRpc.mockResolvedValue({ data: 12347, error: null })

    const allocations: Allocation[] = [
      { issued_invoice_id: 1234, amount_applied: 30.00 },
      { issued_invoice_id: 1235, amount_applied: 70.00 }
    ]

    const args = { ...baseArgs, allocations }
    const result = await createPayment(args)

    expect(result.data).toBe(12347)
    expect(result.error).toBeNull()
    
    // Verify array was passed through unchanged
    expect(mockRpc).toHaveBeenCalledWith('create_client_payment_with_allocations', {
      p_payer_team_id: 15,
      p_received_by_user_id: 60,
      p_payment_date: '2025-01-15',
      p_amount: '100',
      p_payment_currency: 'EUR',
      p_method: 'bank_transfer',
      p_exchange_rate_note: null,
      p_external_ref: 'ABC-123',
      p_notes: 'Test payment',
      p_allocations: allocations // <-- Original array
    })
  })

  it('validates that p_allocations is never JSON.stringify()', async () => {
    mockRpc.mockResolvedValue({ data: 12348, error: null })

    const allocations: Allocation[] = [
      { issued_invoice_id: 1234, amount_applied: 100.00 }
    ]

    const args = { ...baseArgs, allocations }
    await createPayment(args)

    const rpcCall = mockRpc.mock.calls[0]
    const rpcParams = rpcCall[1]
    
    // Assert p_allocations is an actual array object, not a string
    expect(Array.isArray(rpcParams.p_allocations)).toBe(true)
    expect(typeof rpcParams.p_allocations).toBe('object')
    expect(typeof rpcParams.p_allocations).not.toBe('string')
    
    // Verify the allocation object structure
    expect(rpcParams.p_allocations[0]).toEqual({
      issued_invoice_id: 1234,
      amount_applied: 100.00
    })
  })

  it('validates input data with zod schema', async () => {
    const invalidArgs = {
      ...baseArgs,
      payerTeamId: -1, // Invalid: must be positive
      amount: -100,    // Invalid: must be positive
      currency: 'INVALID' // Invalid: must be 3 characters
    }

    const result = await createPayment(invalidArgs)

    expect(result.data).toBeNull()
    expect(result.error).toEqual({
      message: 'Invalid payment data',
      details: expect.any(Object)
    })
    
    // Should not call RPC if validation fails
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('handles database errors gracefully', async () => {
    const dbError = { 
      code: 'PGRST202', 
      message: 'Function not found',
      details: 'Some DB error details'
    }
    mockRpc.mockResolvedValue({ data: null, error: dbError })

    const args = { ...baseArgs }
    const result = await createPayment(args)

    expect(result.data).toBeNull()
    expect(result.error).toEqual(dbError)
  })

  it('uses default payment date when not provided', async () => {
    mockRpc.mockResolvedValue({ data: 12349, error: null })

    const argsWithoutDate = { 
      ...baseArgs,
      paymentDate: undefined 
    }
    
    await createPayment(argsWithoutDate)

    const rpcCall = mockRpc.mock.calls[0]
    const rpcParams = rpcCall[1]
    
    // Should use today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0]
    expect(rpcParams.p_payment_date).toBe(today)
  })

  it('handles null optional fields correctly', async () => {
    mockRpc.mockResolvedValue({ data: 12350, error: null })

    const argsWithNulls = {
      ...baseArgs,
      exchangeRateNote: null,
      externalRef: null,
      notes: null
    }
    
    await createPayment(argsWithNulls)

    const rpcCall = mockRpc.mock.calls[0]
    const rpcParams = rpcCall[1]
    
    expect(rpcParams.p_exchange_rate_note).toBeNull()
    expect(rpcParams.p_external_ref).toBeNull()
    expect(rpcParams.p_notes).toBeNull()
  })
})

describe('RPC parameter structure verification', () => {
  it('ensures the correct structure for raw fetch (if any)', () => {
    // This test documents the expected JSON structure for raw fetch calls
    const expectedBody = {
      "p_payer_team_id": 15,
      "p_received_by_user_id": 60,
      "p_payment_date": "2025-08-22",
      "p_amount": "100.00",
      "p_payment_currency": "EUR",
      "p_method": "bank_transfer",
      "p_exchange_rate_note": null,
      "p_external_ref": "ABC-123",
      "p_notes": null,
      "p_allocations": [
        { "issued_invoice_id": 1234, "amount_applied": 100.00 }
      ]
    }

    // Verify structure - p_allocations should be an array, not a stringified JSON
    expect(Array.isArray(expectedBody.p_allocations)).toBe(true)
    expect(typeof expectedBody.p_allocations).toBe('object')
    expect(typeof expectedBody.p_allocations).not.toBe('string')
    
    // The whole body would be stringified once by fetch(), but inner arrays remain arrays
    const stringifiedBody = JSON.stringify(expectedBody)
    const parsedBack = JSON.parse(stringifiedBody)
    
    expect(Array.isArray(parsedBack.p_allocations)).toBe(true)
    expect(parsedBack.p_allocations[0].issued_invoice_id).toBe(1234)
  })
}) 