import { createClient } from '@supabase/supabase-js'
// TODO: confirm Resend is installed — run: npm install resend
import { Resend } from 'resend'

// ─── Config ──────────────────────────────────────────────────────────────────

const FROM_ADDRESS = 'noreply@PLACEHOLDER_DOMAIN' // TODO: update when domain is confirmed

// ─── Clients ─────────────────────────────────────────────────────────────────

function buildSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  return createClient(url, key)
}

function buildResend() {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY is not set')
  return new Resend(key)
}

const supabase = buildSupabase()
const resend = buildResend()

// ─── Types ────────────────────────────────────────────────────────────────────

export type DigestData = {
  locationId: string
  period: 'daily' | 'weekly'
  responseRate: number           // 0–100, posted / (posted + failed + blocked)
  totalReviews: number
  negativeReviews: number        // rating <= 3
  complaintThemes: string[]      // e.g. ["wait time (3)", "cold food (2)"]
  needsAttention: NeedsAttentionItem[]
  periodStart: Date
  periodEnd: Date
}

type NeedsAttentionItem = {
  reviewId: string
  reason: 'failed' | 'blocked_pending_regen'
  draftText: string
}

// ─── Period helpers ───────────────────────────────────────────────────────────

function getPeriodBounds(period: 'daily' | 'weekly', now: Date): { start: Date; end: Date } {
  const end = new Date(now)
  const start = new Date(now)

  if (period === 'daily') {
    start.setDate(start.getDate() - 1)
  } else {
    start.setDate(start.getDate() - 7)
  }

  return { start, end }
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Complaint theme extraction ───────────────────────────────────────────────

// Keyword groups — each entry is [displayLabel, ...keywords].
// Matched case-insensitively against review text.
const COMPLAINT_KEYWORDS: [string, ...string[]][] = [
  ['wait time',    'wait', 'slow', 'long time', 'took forever', 'hour'],
  ['service',      'service', 'staff', 'rude', 'unfriendly', 'unprofessional', 'ignored'],
  ['cold food',    'cold', 'lukewarm', 'not hot', 'wasn\'t hot'],
  ['wrong order',  'wrong order', 'wrong dish', 'wrong item', 'incorrect order', 'missing'],
]

function extractComplaintThemes(reviewTexts: string[]): string[] {
  const counts: Map<string, number> = new Map()

  for (const text of reviewTexts) {
    const lower = text.toLowerCase()
    for (const [label, ...keywords] of COMPLAINT_KEYWORDS) {
      if (keywords.some(kw => lower.includes(kw))) {
        counts.set(label, (counts.get(label) ?? 0) + 1)
      }
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => `${label} (${count})`)
}

// ─── buildDigest ─────────────────────────────────────────────────────────────

export async function buildDigest(
  locationId: string,
  period: 'daily' | 'weekly',
): Promise<DigestData> {
  const now = new Date()
  const { start, end } = getPeriodBounds(period, now)
  const startIso = start.toISOString()
  const endIso = end.toISOString()

  // Responses posted in the period
  const { data: responses, error: responsesErr } = await supabase
    .from('responses_posted')
    .select('review_id, status, text, failure_reason')
    .eq('location_id', locationId)
    .gte('posted_at', startIso)
    .lte('posted_at', endIso)

  if (responsesErr) throw new Error(`buildDigest responses: ${responsesErr.message}`)

  const posted = (responses ?? []).filter(r => r.status === 'posted').length
  const failed  = (responses ?? []).filter(r => r.status === 'failed').length
  const blocked = (responses ?? []).filter(r => r.status === 'blocked_pending_regen').length
  const total   = posted + failed + blocked
  const responseRate = total === 0 ? 100 : Math.round((posted / total) * 100)

  // Needs-attention items: failed or blocked responses with their draft text
  const needsAttention: NeedsAttentionItem[] = (responses ?? [])
    .filter(r => r.status === 'failed' || r.status === 'blocked_pending_regen')
    .map(r => ({
      reviewId: r.review_id as string,
      reason: r.status as 'failed' | 'blocked_pending_regen',
      draftText: r.text as string,
    }))

  // Reviews received in the period
  const { data: reviews, error: reviewsErr } = await supabase
    .from('reviews')
    .select('rating, text')
    .eq('location_id', locationId)
    .gte('created_at', startIso)
    .lte('created_at', endIso)

  if (reviewsErr) throw new Error(`buildDigest reviews: ${reviewsErr.message}`)

  const allReviews = reviews ?? []
  const negativeReviews = allReviews.filter(r => (r.rating as number) <= 3)

  const complaintThemes = extractComplaintThemes(
    negativeReviews.map(r => (r.text as string) ?? ''),
  )

  return {
    locationId,
    period,
    responseRate,
    totalReviews: allReviews.length,
    negativeReviews: negativeReviews.length,
    complaintThemes,
    needsAttention,
    periodStart: start,
    periodEnd: end,
  }
}

// ─── Email body builder ───────────────────────────────────────────────────────

function buildDigestBody(data: DigestData): string {
  const lines: string[] = []

  lines.push(`Review summary: ${formatDate(data.periodStart)} – ${formatDate(data.periodEnd)}`)
  lines.push('')
  lines.push(`Response rate: ${data.responseRate}%`)
  lines.push(`Total reviews received: ${data.totalReviews}`)
  lines.push(`Negative reviews (3★ or below): ${data.negativeReviews}`)

  if (data.complaintThemes.length > 0) {
    lines.push('')
    lines.push('Recurring complaint themes:')
    for (const theme of data.complaintThemes) {
      lines.push(`  • ${theme}`)
    }
  }

  if (data.needsAttention.length > 0) {
    lines.push('')
    lines.push(`Needs attention (${data.needsAttention.length} response${data.needsAttention.length === 1 ? '' : 's'} failed to post):`)
    lines.push('')
    for (const item of data.needsAttention) {
      const reasonText = item.reason === 'failed'
        ? 'failed to post after 3 attempts'
        : 'blocked by quality check — needs review'
      lines.push(`Review ${item.reviewId}: ${reasonText}`)
      lines.push('Draft text (you can post this manually on Google):')
      lines.push(`  "${item.draftText}"`)
      lines.push('')
    }
  } else {
    lines.push('')
    lines.push('All responses posted successfully.')
  }

  return lines.join('\n')
}

// ─── sendDigest ──────────────────────────────────────────────────────────────

export async function sendDigest(locationId: string): Promise<void> {
  // Load notification preferences
  const { data: prefs, error: prefsErr } = await supabase
    .from('notification_preferences')
    .select('digest_frequency, digest_day, digest_time, timezone')
    .eq('location_id', locationId)
    .single()

  if (prefsErr || !prefs) {
    throw new Error(`sendDigest: no notification preferences for ${locationId}`)
  }

  const frequency = prefs.digest_frequency as 'daily' | 'weekly'
  const digestDay  = prefs.digest_day as number | null   // 0=Sun … 6=Sat
  const timezone   = (prefs.timezone as string) || 'UTC'

  // Check whether today matches the schedule
  const now = new Date()
  const todayInTz = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: timezone,
  }).format(now)

  // Map abbreviated weekday → 0-indexed day number matching digest_day
  const DAY_ABBR: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  }
  const todayDayNumber = DAY_ABBR[todayInTz]

  if (frequency === 'weekly') {
    if (digestDay === null || digestDay === undefined) return
    if (todayDayNumber !== digestDay) return
  }
  // daily: always send — no day check needed

  // Fetch owner email from Supabase auth via the location row
  const { data: location, error: locErr } = await supabase
    .from('locations')
    .select('owner_id')
    .eq('id', locationId)
    .single()

  if (locErr || !location) throw new Error(`sendDigest: location ${locationId} not found`)

  const { data: { user }, error: userErr } = await supabase.auth.admin.getUserById(
    location.owner_id as string,
  )
  if (userErr || !user?.email) throw new Error(`sendDigest: owner email not found for ${locationId}`)

  const data = await buildDigest(locationId, frequency)

  const subject = `Your review summary — ${formatDate(data.periodStart)} to ${formatDate(data.periodEnd)}`
  const body = buildDigestBody(data)

  await resend.emails.send({
    from: FROM_ADDRESS,
    to: user.email,
    subject,
    text: body,
  })
}

// ─── sendFailureAlert ─────────────────────────────────────────────────────────

export async function sendFailureAlert(
  locationId: string,
  reviewId: string,
  draftText: string,
): Promise<void> {
  const { data: location, error: locErr } = await supabase
    .from('locations')
    .select('owner_id')
    .eq('id', locationId)
    .single()

  if (locErr || !location) throw new Error(`sendFailureAlert: location ${locationId} not found`)

  const { data: { user }, error: userErr } = await supabase.auth.admin.getUserById(
    location.owner_id as string,
  )
  if (userErr || !user?.email) throw new Error(`sendFailureAlert: owner email not found for ${locationId}`)

  const subject = 'Action needed: review response failed to post'

  const body = [
    'A review response failed to post to Google after 3 attempts.',
    '',
    'This usually means a temporary issue with the Google Business Profile API.',
    'You can post the response manually — the draft is below.',
    '',
    `Review ID: ${reviewId}`,
    '',
    'Draft response:',
    `"${draftText}"`,
    '',
    'To post manually: go to your Google Business Profile, find the review, and paste the draft above.',
    '',
    'If this keeps happening, check your Google account connection in the app.',
  ].join('\n')

  await resend.emails.send({
    from: FROM_ADDRESS,
    to: user.email,
    subject,
    text: body,
  })
}
