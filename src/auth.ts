export type AuthRole = 'admin' | 'user'

export interface AuthUser {
  name: string
  email: string
  role: AuthRole
  picture?: string
}

const SESSION_KEY = 'strenth.auth.session'

interface GoogleJwtPayload {
  email?: string
  email_verified?: boolean
  name?: string
  picture?: string
}

const adminEmails = (import.meta.env.VITE_ADMIN_EMAILS ?? 'admin@strenth.ai,suraj@strenth.ai')
  .split(',')
  .map(email => email.trim().toLowerCase())
  .filter(Boolean)

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - base64.length % 4) % 4), '=')
  return decodeURIComponent(
    atob(padded)
      .split('')
      .map(char => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join(''),
  )
}

function decodeGoogleCredential(credential: string): GoogleJwtPayload | null {
  const [, payload] = credential.split('.')
  if (!payload) return null

  try {
    return JSON.parse(decodeBase64Url(payload)) as GoogleJwtPayload
  } catch {
    return null
  }
}

export function getSession(): AuthUser | null {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null

  try {
    const user = JSON.parse(raw) as AuthUser
    if (!user.email || !user.role) return null
    return user
  } catch {
    localStorage.removeItem(SESSION_KEY)
    return null
  }
}

export function signInWithGoogleCredential(credential: string): AuthUser | null {
  const payload = decodeGoogleCredential(credential)
  if (!payload?.email || payload.email_verified === false) return null

  const email = payload.email.trim().toLowerCase()

  const user: AuthUser = {
    name: payload.name ?? email.split('@')[0] ?? 'Strenth User',
    email,
    role: adminEmails.includes(email) ? 'admin' : 'user',
    picture: payload.picture,
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  return user
}

export function signInAsGuest(): AuthUser {
  const user: AuthUser = {
    name: 'Guest',
    email: 'guest@strenth.ai',
    role: 'user',
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  return user
}

export function createSession(user: AuthUser): AuthUser {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  return user
}

export function signOut() {
  localStorage.removeItem(SESSION_KEY)
}
