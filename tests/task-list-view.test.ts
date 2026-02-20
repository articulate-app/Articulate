import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchTasksFromView } from '../app/lib/fetchTasksFromView'
import type { TaskListFilters } from '../app/lib/types/task-list-view'

const mockRpc = vi.fn().mockResolvedValue({ data: { rows: [], next_cursor: null }, error: null })

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createClientComponentClient: () => ({
    rpc: mockRpc,
  }),
}))

describe('fetchTasksFromView – groupOrder handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const baseFilters: TaskListFilters = {
    page: 1,
    perPage: 10,
  }

  it('uses ascending group order for assigned_to when groupOrder=asc', async () => {
    await fetchTasksFromView({
      ...baseFilters,
      groupBy: 'assigned_to',
      groupOrder: 'asc',
      mode: 'grouped',
    })

    expect(mockRpc).toHaveBeenCalledTimes(1)
    const [, params] = mockRpc.mock.calls[0]
    expect(params.p_group_by).toBe('assigned_to')
    expect(params.p_group_order).toBe('asc')
  })

  it('uses descending group order for assigned_to when groupOrder=desc', async () => {
    await fetchTasksFromView({
      ...baseFilters,
      groupBy: 'assigned_to',
      groupOrder: 'desc',
      mode: 'grouped',
    })

    expect(mockRpc).toHaveBeenCalledTimes(1)
    const [, params] = mockRpc.mock.calls[0]
    expect(params.p_group_by).toBe('assigned_to')
    expect(params.p_group_order).toBe('desc')
  })
})


