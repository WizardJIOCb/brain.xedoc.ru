import 'server-only'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const SELF_HOSTED_SESSION_COOKIE = 'brain_admin_session'

export interface SelfHostedSession {
  userId: string
  email: string | null
  exp: number
}

function enabled(): boolean {
  return process.env.SELF_HOSTED_ADMIN === '1'
}

function secret(): string {
  const value = process.env.ADMIN_SESSION_SECRET
  if (!value || value.length < 32) {
    throw new Error('ADMIN_SESSION_SECRET must be set to at least 32 chars')
  }
  return value
}

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url')
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

export function createSelfHostedSession(): string {
  if (!enabled()) throw new Error('self-hosted admin is disabled')
  const ttlSeconds = parseInt(process.env.ADMIN_SESSION_TTL_SECONDS ?? '28800', 10)
  const session: SelfHostedSession = {
    userId: 'self-hosted-admin',
    email: process.env.ADMIN_EMAIL || 'admin@brain.local',
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  }
  const payload = base64url(JSON.stringify(session))
  return `${payload}.${sign(payload)}`
}

export function verifySelfHostedSession(token: string | undefined): SelfHostedSession | null {
  if (!enabled() || !token) return null
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null
  const expected = sign(payload)
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const session = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as SelfHostedSession
    if (!session.exp || session.exp < Math.floor(Date.now() / 1000)) return null
    return session
  } catch {
    return null
  }
}

export function verifySelfHostedPassword(password: string): boolean {
  if (!enabled()) return false
  const configured = process.env.ADMIN_PASSWORD_HASH
  if (!configured?.startsWith('sha256:')) {
    throw new Error('ADMIN_PASSWORD_HASH must be configured as sha256:<hex>')
  }
  const actual =
    'sha256:' + createHash('sha256').update(password, 'utf8').digest('hex')
  const a = Buffer.from(actual)
  const b = Buffer.from(configured)
  return a.length === b.length && timingSafeEqual(a, b)
}
