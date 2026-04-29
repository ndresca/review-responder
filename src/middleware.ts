import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Auth gate: /dashboard/* and /settings/* require an autoplier_session cookie
// (set by src/app/api/auth/google/callback/route.ts after a successful OAuth
// round-trip). Unauthenticated requests redirect to /onboarding so the user
// re-enters the connect flow rather than landing on a blank page.
//
// All other routes pass through — landing, onboarding, the API routes (which
// do their own per-route cookie checks), the error page, etc.
export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get('autoplier_session')?.value
  if (sessionCookie) return NextResponse.next()

  // Redirect to /onboarding, preserving the original destination as ?next=
  // so a future enhancement could bounce the user back after auth. We don't
  // read it yet; the OAuth callback's existing redirect is the source of
  // truth for post-auth destination today.
  const url = new URL('/onboarding', request.url)
  url.searchParams.set('next', request.nextUrl.pathname)
  return NextResponse.redirect(url)
}

// matcher restricts which routes the middleware runs on. Keeping this narrow
// avoids unnecessary edge-runtime overhead on routes that don't need the gate.
export const config = {
  matcher: ['/dashboard/:path*', '/settings/:path*'],
}
