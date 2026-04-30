import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Auth gate for /dashboard/*, /settings/*, /history/*. Three states:
//
// 1) sb-* JWT cookie present → pass through. Route-level getValidSession
//    does the signature/expiry/user-existence check; the edge just keeps
//    obviously unauthenticated traffic out without DB latency.
//
// 2) sb-* missing/expired BUT autoplier_refresh present → redirect to
//    /api/auth/refresh?next=<original path>. That route trades the refresh
//    cookie for a fresh sb-* JWT and redirects to <next> on success, or
//    to /onboarding on failure (with refresh cookie cleared).
//
// 3) Both cookies missing → redirect to /onboarding (re-OAuth path).
//
// We don't validate JWT signature here — pulling jose into the edge bundle
// for every request is too expensive vs the cost of one extra hop on
// JWT-expired requests. The refresh endpoint does the real validation.
export function middleware(request: NextRequest) {
  const allCookies = request.cookies.getAll()
  const hasSupabaseAuth = allCookies.some(c =>
    /^sb-.+-auth-token(\.\d+)?$/.test(c.name) && c.value.length > 0
  )

  if (hasSupabaseAuth) {
    return NextResponse.next()
  }

  const hasRefreshCookie = !!request.cookies.get('autoplier_refresh')?.value

  if (hasRefreshCookie) {
    // Try to refresh. The refresh route redirects to `next` on success,
    // /onboarding on failure — either way the user lands somewhere sane
    // without a flash of the unauthenticated page.
    const refreshUrl = new URL('/api/auth/refresh', request.url)
    refreshUrl.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search)
    return NextResponse.redirect(refreshUrl)
  }

  // No auth, no refresh — go re-OAuth.
  const url = new URL('/onboarding', request.url)
  url.searchParams.set('next', request.nextUrl.pathname)
  return NextResponse.redirect(url)
}

// matcher restricts which routes the middleware runs on. Keeping this narrow
// avoids unnecessary edge-runtime overhead on routes that don't need the gate.
export const config = {
  matcher: ['/dashboard/:path*', '/settings/:path*', '/history/:path*'],
}
