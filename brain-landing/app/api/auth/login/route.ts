import { NextRequest, NextResponse } from 'next/server'
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
} from '@/lib/pkce'
import {
  SELF_HOSTED_SESSION_COOKIE,
  createSelfHostedSession,
  verifySelfHostedPassword,
} from '@/lib/self-hosted-session'

/**
 * GET /api/auth/login?return_url=/en/admin/graph
 *
 * Kicks off the OAuth Authorization Code + PKCE flow against auth.inite.ai.
 * The `state` + `code_verifier` + `return_url` are stashed in short-lived
 * HttpOnly cookies so the /callback handler can rehydrate them — we don't
 * have Prisma here, and serverless restarts make in-memory state unsafe.
 * Cookies are scoped to /api/auth so they only leak where they're read.
 */

const AUTH_PUBLIC_URL =
  process.env.NEXT_PUBLIC_AUTH_SERVICE_URL || 'https://auth.inite.ai'

const CLIENT_ID =
  process.env.OAUTH_CLIENT_ID ||
  process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID ||
  'brain-landing'

const SCOPE = 'openid profile email'

function appOrigin(request: NextRequest): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  if (!host) throw new Error('Cannot derive app origin: no host header')
  return `${proto}://${host}`
}

function safeReturnUrl(request: NextRequest): string {
  const rawReturn =
    request.nextUrl.searchParams.get('return_url') || '/en/admin/graph'
  return rawReturn.startsWith('/') && !rawReturn.startsWith('//')
    ? rawReturn
    : '/en/admin/graph'
}

function selfHostedLoginPage(request: NextRequest, error = ''): NextResponse {
  const returnUrl = safeReturnUrl(request)
  const action = `/api/auth/login?return_url=${encodeURIComponent(returnUrl)}`
  return new NextResponse(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Brain Admin</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0e1116; color: #edf1f7; }
    main { width: min(420px, calc(100vw - 32px)); }
    h1 { margin: 0 0 8px; font-size: 28px; }
    p { color: #9aa6b2; line-height: 1.5; }
    form { display: grid; gap: 14px; margin-top: 24px; }
    input, button { height: 44px; border-radius: 8px; font: inherit; }
    input { border: 1px solid #2a3441; background: #151b23; color: #edf1f7; padding: 0 12px; }
    button { border: 0; background: #6ee7b7; color: #07110d; font-weight: 700; cursor: pointer; }
    .error { color: #ff8a8a; min-height: 24px; }
  </style>
</head>
<body>
  <main>
    <h1>Brain Admin</h1>
    <p>Sign in to use the self-hosted playground and admin console.</p>
    <form method="post" action="${action}">
      <input name="password" type="password" autocomplete="current-password" placeholder="Admin password" autofocus required>
      <button type="submit">Sign in</button>
      <div class="error">${error}</div>
    </form>
  </main>
</body>
</html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

export async function GET(request: NextRequest) {
  const returnUrl = safeReturnUrl(request)

  if (process.env.SELF_HOSTED_ADMIN === '1') {
    return selfHostedLoginPage(request)
  }

  const state = generateState()
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const redirectUri = `${appOrigin(request)}/api/auth/callback`

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope: SCOPE,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })

  const res = NextResponse.redirect(
    `${AUTH_PUBLIC_URL}/oauth/authorize?${params.toString()}`,
  )

  const cookieOpts = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth',
    maxAge: 10 * 60, // 10 minutes — must exceed user's login time
  }
  res.cookies.set('oauth_state', state, cookieOpts)
  res.cookies.set('oauth_code_verifier', codeVerifier, cookieOpts)
  res.cookies.set('oauth_return_url', returnUrl, cookieOpts)
  return res
}

export async function POST(request: NextRequest) {
  if (process.env.SELF_HOSTED_ADMIN !== '1') {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
  }

  const form = await request.formData()
  const password = String(form.get('password') ?? '')
  if (!verifySelfHostedPassword(password)) {
    return selfHostedLoginPage(request, 'Invalid password')
  }

  const dest = new URL(safeReturnUrl(request), appOrigin(request))
  const res = NextResponse.redirect(dest)
  res.cookies.set(SELF_HOSTED_SESSION_COOKIE, createSelfHostedSession(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: parseInt(process.env.ADMIN_SESSION_TTL_SECONDS ?? '28800', 10),
  })
  return res
}
