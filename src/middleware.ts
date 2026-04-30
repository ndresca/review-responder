import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Auth gate: /dashboard/*, /settings/*, /history/* require a Supabase auth
// JWT cookie (sb-<project-ref>-auth-token, set by the OAuth callback after
// JWT minting). Unauthenticated requests redirect to /onboarding so the
// user re-enters the connect flow rather than landing on a blank page.
//
// Edge-runtime presence check only — we don't validate the JWT signature
// here (avoid pulling jose / supabase-ssr into the edge bundle for every
// request). The full validation happens at the route level via
// getValidSession (which calls Supabase auth.getUser to verify signature
// + user existence). The middleware is just a UX gate to keep obvious
// unauthenticated traffic out without DB latency.
export function middleware(request: NextRequest) {
  // Cookie name format is `sb-<project-ref>-auth-token` (or `.0`/`.1` chunks
  // for large sessions). Match any cookie that starts with `sb-` and ends
  // with `-auth-token` (with optional .N suffix). Presence-only check.
  const hasSupabaseAuth = request.cookies.getAll().some(c =>
    /^sb-.+-auth-token(\.\d+)?$/.test(c.name) && c.value.length > 0
  )

  if (hasSupabaseAuth) {
    return NextResponse.next()
  }

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
  matcher: ['/dashboard/:path*', '/settings/:path*', '/history/:path*'],
}
