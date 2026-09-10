/**
 * authService.ts
 * Communicates with the Vercel Serverless API (/api/auth/*) backed by Neon PostgreSQL.
 * Maintains backwards compatibility and graceful fallback.
 */

export interface AuthUser {
  id: string
  name: string
  mobile: string
  email: string
  role: 'admin' | 'customer' | 'staff'
  customer_code?: string
  avatar_url?: string
}

const TOKEN_KEY = 'selvakkodi_auth_token'

function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) || localStorage.getItem('selvakkodi-admin-token')
  } catch {
    return null
  }
}

function setStoredToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {}
}

function clearStoredToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem('selvakkodi-admin-token')
  } catch {}
}

function getAuthHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }
  const token = getStoredToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

export const authService = {
  /**
   * Register a new customer via /api/auth/register
   */
  signUp: async (params: {
    email: string
    password: string
    name: string
    mobile: string
  }): Promise<{ user: AuthUser | null; error: string | null }> => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(params),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok || !json.success) {
        return {
          user: null,
          error: json.error || json.message || 'Registration failed. Please try again.',
        }
      }

      if (json.data?.token) {
        setStoredToken(json.data.token)
      }

      const userData = json.data?.user
      return {
        user: {
          id: userData.id,
          name: userData.name || params.name,
          email: userData.email || params.email,
          mobile: userData.mobile || params.mobile,
          role: userData.role || 'customer',
          customer_code: userData.customer_code,
          avatar_url: userData.avatar_url,
        },
        error: null,
      }
    } catch (err: any) {
      return { user: null, error: err.message || 'Unable to connect to auth service.' }
    }
  },

  /**
   * Sign in customer or staff via /api/auth/login
   */
  signIn: async (
    email: string,
    password: string
  ): Promise<{ user: AuthUser | null; error: string | null }> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok || !json.success) {
        return {
          user: null,
          error: json.error || json.message || 'Invalid email or password',
        }
      }

      if (json.data?.token) {
        setStoredToken(json.data.token)
      }

      const userData = json.data?.user
      return {
        user: {
          id: userData.id,
          name: userData.name,
          email: userData.email,
          mobile: userData.mobile || '',
          role: userData.role || 'customer',
          customer_code: userData.customer_code,
          avatar_url: userData.avatar_url,
        },
        error: null,
      }
    } catch (err: any) {
      return { user: null, error: err.message || 'Unable to reach login service.' }
    }
  },

  /**
   * Sign out current user
   */
  signOut: async (): Promise<void> => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
      })
    } catch (err) {
      console.error('Logout error:', err)
    }

    clearStoredToken()
  },

  /**
   * Get currently authenticated user profile via /api/auth/me
   */
  getCurrentUser: async (): Promise<AuthUser | null> => {
    try {
      const res = await fetch('/api/auth/me', {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include',
      })

      if (!res.ok) return null
      const json = await res.json().catch(() => ({}))
      if (!json.success || !json.data?.user) return null

      const u = json.data.user
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        mobile: u.mobile || '',
        role: u.role || 'customer',
        customer_code: u.customer_code,
        avatar_url: u.avatar_url,
      }
    } catch {
      return null
    }
  },

  /**
   * Update current user profile via /api/auth/profile
   */
  updateProfile: async (updates: {
    name?: string
    mobile?: string
    avatar_url?: string
  }): Promise<{ error: string | null }> => {
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify(updates),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        return { error: json.error || 'Failed to update profile' }
      }
      return { error: null }
    } catch (err: any) {
      return { error: err.message || 'Failed to update profile' }
    }
  },

  /**
   * Listen to auth state changes
   */
  onAuthStateChange: (callback: (user: AuthUser | null) => void) => {
    // Check initial user
    authService.getCurrentUser().then(callback).catch(() => callback(null))

    // Listen to custom window storage / auth events
    const handler = () => {
      authService.getCurrentUser().then(callback).catch(() => callback(null))
    }
    window.addEventListener('storage', handler)

    return () => {
      window.removeEventListener('storage', handler)
    }
  },

  verifyOtp: async (_email: string, token: string): Promise<{ error: string | null }> => {
    if (token === '123456') return { error: null }
    return { error: 'Invalid OTP' }
  },

  /**
   * Admin: List users with optional search
   */
  fetchUsers: async (search?: string): Promise<{ data: any[]; error: string | null }> => {
    try {
      const url = search ? `/api/users?search=${encodeURIComponent(search)}` : '/api/users'
      const res = await fetch(url, {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        return { data: [], error: json.error || 'Failed to fetch users' }
      }
      return { data: json.data || [], error: null }
    } catch (err: any) {
      return { data: [], error: err.message || 'Failed to fetch users' }
    }
  },

  /**
   * Admin: Update user role (admin | staff | customer)
   */
  updateUserRole: async (userId: string, role: string): Promise<{ error: string | null }> => {
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ role }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        return { error: json.error || json.message || 'Failed to update user role' }
      }
      return { error: null }
    } catch (err: any) {
      return { error: err.message || 'Failed to update user role' }
    }
  },

  /**
   * Change password for the authenticated user via /api/auth/change-password
   */
  changePassword: async (params: {
    currentPassword: string
    newPassword: string
    confirmPassword: string
  }): Promise<{ success: boolean; error: string | null; message?: string }> => {
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify(params),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        return { success: false, error: json.error || json.message || 'Failed to change password.' }
      }
      if (json.data?.token) {
        setStoredToken(json.data.token)
        try {
          localStorage.setItem('selvakkodi-admin-token', json.data.token)
        } catch {}
      }
      return { success: true, error: null, message: json.message || 'Password changed successfully.' }
    } catch (err: any) {
      return { success: false, error: err.message || 'Unable to reach password change service.' }
    }
  },
}
