import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiRequest, setStoredToken, getStoredToken } from '@/services/api'

export interface User {
  id: number
  username: string
  name: string
  email: string | null
  role: 'admin' | 'counter' | 'ticket' | 'user'
  counter_id: number | null
  counter_name?: string | null
  is_active: number
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(getStoredToken())
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => !!user.value && !!token.value)
  const role = computed(() => user.value?.role || null)
  const counterId = computed(() => user.value?.counter_id || null)
  const counterName = computed(() => user.value?.counter_name || null)

  function getDefaultRoute(userRole?: string | null): string {
    const r = userRole || role.value
    switch (r) {
      case 'ticket':
        return '/ticket'
      case 'counter':
        return '/counter'
      case 'admin':
        return '/admin/queue'
      default:
        return '/ticket'
    }
  }

  async function login(username: string, password: string): Promise<User> {
    isLoading.value = true
    error.value = null
    try {
      const res = await apiRequest<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      })

      token.value = res.token
      user.value = res.user
      setStoredToken(res.token)
      return res.user
    } catch (err: any) {
      error.value = err.message || 'Login failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function signup(name: string, email: string, password: string, username?: string): Promise<User> {
    isLoading.value = true
    error.value = null
    try {
      const res = await apiRequest<{ token: string; user: User }>('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, username })
      })

      token.value = res.token
      user.value = res.user
      setStoredToken(res.token)
      return res.user
    } catch (err: any) {
      error.value = err.message || 'Signup failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function fetchCurrentUser(): Promise<User | null> {
    if (!token.value) return null
    try {
      const res = await apiRequest<{ user: User }>('/api/auth/me')
      user.value = res.user
      return res.user
    } catch (err) {
      logout()
      return null
    }
  }

  async function logout(): Promise<void> {
    try {
      if (token.value) {
        await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => {})
      }
    } finally {
      user.value = null
      token.value = null
      setStoredToken(null)
    }
  }

  return {
    user,
    token,
    isLoading,
    error,
    isAuthenticated,
    role,
    counterId,
    counterName,
    getDefaultRoute,
    login,
    signup,
    fetchCurrentUser,
    logout
  }
})
