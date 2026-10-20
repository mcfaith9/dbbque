export interface ApiResponse<T = any> {
  data?: T
  error?: string
}

export function getStoredToken(): string | null {
  return localStorage.getItem('dbbque_token')
}

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem('dbbque_token', token)
  } else {
    localStorage.removeItem('dbbque_token')
  }
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken()
  const headers = new Headers(options.headers || {})

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(endpoint, {
    ...options,
    headers
  })

  let body: any
  const contentType = res.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    body = await res.json()
  } else {
    body = await res.text()
  }

  if (!res.ok) {
    const errorMsg = body?.error || body?.message || res.statusText || 'Request failed'
    const error = new Error(errorMsg) as any
    error.status = res.status
    error.body = body
    throw error
  }

  return body as T
}
