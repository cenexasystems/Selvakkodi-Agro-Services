export interface ExpenseCategory {
  id: number
  name: string
  is_active: boolean
  created_at?: string
}

export interface Expense {
  id: string
  category_id: number
  amount: number
  expense_date: string
  description: string | null
  receipt_url: string | null
  created_by?: string | null
  created_at: string
  updated_at?: string
  expense_categories?: { id?: number; name: string } | null
}

function getAuthHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }
  const token =
    localStorage.getItem('selvakkodi_auth_token') ||
    localStorage.getItem('selvakkodi-admin-token') ||
    localStorage.getItem('purple-boutique-token')
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

export async function fetchExpenses(filters?: {
  startDate?: string
  endDate?: string
  categoryId?: number
}): Promise<{ data: Expense[]; error: string | null }> {
  try {
    const params = new URLSearchParams()
    if (filters?.startDate) params.append('startDate', filters.startDate)
    if (filters?.endDate) params.append('endDate', filters.endDate)
    if (filters?.categoryId) params.append('categoryId', String(filters.categoryId))

    const url = `/api/expenses${params.toString() ? `?${params.toString()}` : ''}`
    const res = await fetch(url, {
      headers: getAuthHeaders(),
      credentials: 'include',
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.success) {
      return { data: [], error: json.error || 'Failed to fetch expenses' }
    }

    return { data: json.data || [], error: null }
  } catch (err: any) {
    return { data: [], error: err.message || 'Network error fetching expenses' }
  }
}

export async function getExpenseById(id: string): Promise<{ data: Expense | null; error: string | null }> {
  try {
    const res = await fetch(`/api/expenses/${id}`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.success) {
      return { data: null, error: json.error || 'Expense not found' }
    }

    return { data: json.data || null, error: null }
  } catch (err: any) {
    return { data: null, error: err.message || 'Network error fetching expense' }
  }
}

export async function createExpense(payload: {
  category_id: number
  amount: number
  expense_date?: string
  description?: string | null
  receipt_url?: string | null
}): Promise<{ data: Expense | null; error: string | null }> {
  try {
    const res = await fetch('/api/expenses', {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(payload),
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.success) {
      return { data: null, error: json.error || 'Failed to record expense' }
    }

    return { data: json.data, error: null }
  } catch (err: any) {
    return { data: null, error: err.message || 'Network error recording expense' }
  }
}

export async function updateExpense(
  id: string,
  payload: Partial<{
    category_id: number
    amount: number
    expense_date: string
    description: string | null
    receipt_url: string | null
  }>
): Promise<{ data: Expense | null; error: string | null }> {
  try {
    const res = await fetch(`/api/expenses/${id}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(payload),
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.success) {
      return { data: null, error: json.error || 'Failed to update expense' }
    }

    return { data: json.data, error: null }
  } catch (err: any) {
    return { data: null, error: err.message || 'Network error updating expense' }
  }
}

export async function deleteExpense(id: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const res = await fetch(`/api/expenses/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      credentials: 'include',
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.success) {
      return { success: false, error: json.error || 'Failed to delete expense' }
    }

    return { success: true, error: null }
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error deleting expense' }
  }
}

export async function fetchCategories(options?: {
  activeOnly?: boolean
}): Promise<{ data: ExpenseCategory[]; error: string | null }> {
  try {
    const params = new URLSearchParams()
    if (options?.activeOnly) params.append('activeOnly', 'true')

    const url = `/api/expenses/categories${params.toString() ? `?${params.toString()}` : ''}`
    const res = await fetch(url, {
      headers: getAuthHeaders(),
      credentials: 'include',
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.success) {
      return { data: [], error: json.error || 'Failed to fetch expense categories' }
    }

    return { data: json.data || [], error: null }
  } catch (err: any) {
    return { data: [], error: err.message || 'Network error fetching expense categories' }
  }
}

export async function createCategory(name: string): Promise<{ data: ExpenseCategory | null; error: string | null }> {
  try {
    const res = await fetch('/api/expenses/categories', {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ name }),
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.success) {
      return { data: null, error: json.error || 'Failed to create expense category' }
    }

    return { data: json.data, error: null }
  } catch (err: any) {
    return { data: null, error: err.message || 'Network error creating expense category' }
  }
}

export async function updateCategory(
  id: number,
  payload: { name?: string; is_active?: boolean }
): Promise<{ data: ExpenseCategory | null; error: string | null }> {
  try {
    const res = await fetch(`/api/expenses/categories/${id}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(payload),
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.success) {
      return { data: null, error: json.error || 'Failed to update expense category' }
    }

    return { data: json.data, error: null }
  } catch (err: any) {
    return { data: null, error: err.message || 'Network error updating expense category' }
  }
}

export async function deleteCategory(id: number): Promise<{ success: boolean; error: string | null }> {
  try {
    const res = await fetch(`/api/expenses/categories/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      credentials: 'include',
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.success) {
      return { success: false, error: json.error || 'Failed to delete expense category' }
    }

    return { success: true, error: null }
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error deleting expense category' }
  }
}

export const expenseService = {
  fetchExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory,
}
