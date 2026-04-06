import { createClient } from '@supabase/supabase-js'
// TODO: confirm Resend is installed — run: npm install resend
import { Resend } from 'resend'

// ─── Config ──────────────────────────────────────────────────────────────────

const FROM_ADDRESS = 'noreply@PLACEHOLDER_DOMAIN' // TODO: update when domain is confirmed

// ─── Clients ─────────────────────────────────────────────────────────────────

let _supabase: ReturnType<typeof createClient> | undefined
let _resend: Resend | undefined

function getSupabase() {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
    _supabase = createClient(url, key)
  }
  return _supabase
}

function getResend() {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error('RESEND_API_KEY is not set')
    _resend = new Resend(key)
  }
  return _resend
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type DigestData = {
  locationId: string
  period: 'daily' | 'weekly'
  responseRate: number           // 0–100, responses posted / reviews received in period
  totalReviews: number
  negativeReviews: number        // rating <= 3
  complaintThemes: string[]      // e.g. ["wait time (3)", "cold food (2)"]
  needsAttention: NeedsAttentionItem[]
  periodStart: Date
  periodEnd: Date
}

type NeedsAttentionItem = {
  reviewId: string
  reason: 'failed' | 'retrying' | 'blocked_pending_regen'
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

  // Responses successfully posted in the period (posted_at is only set for posted rows)
  const { data: postedRows, error: postedErr } = await getSupabase()
    .from('responses_posted')
    .select('review_id')
    .eq('location_id', locationId)
    .eq('status', 'posted')
    .gte('posted_at', startIso)
    .lte('posted_at', endIso)

  if (postedErr) throw new Error(`buildDigest posted: ${postedErr.message}`)

  // Unresolved failures — responses_posted has no created_at, so we cannot filter by period.
  // Show all outstanding failures for visibility; they are NOT counted in responseRate
  // (we use reviews received in the period as the denominator instead — see below).
  const { data: unresolvedRows, error: unresolvedErr } = await getSupabase()
    .from('responses_posted')
    .select('review_id, status, text')
    .eq('location_id', locationId)
    .in('status', ['failed', 'retrying', 'blocked_pending_regen'])
    .limit(100)

  if (unresolvedErr) throw new Error(`buildDigest unresolved: ${unresolvedErr.message}`)

  const posted = (postedRows ?? []).length

  // Needs-attention items: all unresolved failures with their draft text
  const needsAttention: NeedsAttentionItem[] = (unresolvedRows ?? []).map(r => ({
    reviewId: r.review_id as string,
    reason: r.status as 'failed' | 'retrying' | 'blocked_pending_regen',
    draftText: r.text as string,
  }))

  // Reviews received in the period
  const { data: reviews, error: reviewsErr } = await getSupabase()
    .from('reviews')
    .select('rating, text')
    .eq('location_id', locationId)
    .gte('created_at', startIso)
    .lte('created_at', endIso)

  if (reviewsErr) throw new Error(`buildDigest reviews: ${reviewsErr.message}`)

  const allReviews = reviews ?? []
  const negativeReviews = allReviews.filter(r => (r.rating as number) <= 3)

  // responseRate = responses posted / reviews received in period.
  // Using review count as denominator keeps the rate period-bounded and meaningful.
  const responseRate = allReviews.length === 0 ? 100 : Math.round((posted / allReviews.length) * 100)

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
  const { data: prefs, error: prefsErr } = await getSupabase()
    .from('notification_preferences')
    .select('digest_frequency, digest_day, digest_time, timezone, last_digest_sent_at')
    .eq('location_id', locationId)
    .single()

  if (prefsErr || !prefs) {
    throw new Error(`sendDigest: no notification preferences for ${locationId}`)
  }

  const frequency  = prefs.digest_frequency as 'daily' | 'weekly'
  const digestDay  = prefs.digest_day as number | null   // 0=Sun … 6=Sat
  const digestHour = prefs.digest_time as number         // 0–23, hour in owner's timezone
  const timezone   = (prefs.timezone as string) || 'UTC'

  // Check whether today + current hour matches the schedule
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
    timeZone: timezone,
  })
  const parts = formatter.formatToParts(now)
  const todayInTz     = parts.find(p => p.type === 'weekday')?.value ?? ''
  const currentHourTz = parseInt(parts.find(p => p.type === 'hour')?.value ?? '-1', 10)

  // Map abbreviated weekday → 0-indexed day number matching digest_day
  const DAY_ABBR: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  }
  const todayDayNumber = DAY_ABBR[todayInTz]

  // Only send during the configured hour — prevents duplicate sends across 15-min cron ticks
  if (currentHourTz !== digestHour) return

  if (frequency === 'weekly') {
    if (digestDay === null || digestDay === undefined) return
    if (todayDayNumber === undefined || todayDayNumber !== digestDay) return
  }
  // daily: hour check above is sufficient — no day check needed

  // Dedup: skip if we already sent a digest in the last 23 hours (daily) or 6 days (weekly).
  // This prevents the 4x-per-hour problem: cron fires at :00, :15, :30, :45 and all
  // four calls pass the hour check. Only the first one gets through.
  const lastSent = prefs.last_digest_sent_at ? new Date(prefs.last_digest_sent_at as string) : null
  if (lastSent) {
    const hoursSinceLast = (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60)
    const minGapHours = frequency === 'daily' ? 23 : 6 * 24
    if (hoursSinceLast < minGapHours) return
  }

  // Mark as sent BEFORE actually sending — if the email fails, we skip this window
  // rather than spam 4 copies. The next window will retry.
  const { error: stampErr } = await getSupabase()
    .from('notification_preferences')
    .update({ last_digest_sent_at: now.toISOString() })
    .eq('location_id', locationId)

  if (stampErr) {
    console.error(`sendDigest: failed to stamp last_digest_sent_at for ${locationId}:`, stampErr.message)
    return
  }

  // Fetch owner email from Supabase auth via the location row
  const { data: location, error: locErr } = await getSupabase()
    .from('locations')
    .select('owner_id')
    .eq('id', locationId)
    .single()

  if (locErr || !location) throw new Error(`sendDigest: location ${locationId} not found`)

  const { data: { user }, error: userErr } = await getSupabase().auth.admin.getUserById(
    location.owner_id as string,
  )
  if (userErr || !user?.email) throw new Error(`sendDigest: owner email not found for ${locationId}`)

  const data = await buildDigest(locationId, frequency)

  const subject = `Your review summary — ${formatDate(data.periodStart)} to ${formatDate(data.periodEnd)}`
  const body = buildDigestBody(data)

  await getResend().emails.send({
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
  const { data: location, error: locErr } = await getSupabase()
    .from('locations')
    .select('owner_id')
    .eq('id', locationId)
    .single()

  if (locErr || !location) throw new Error(`sendFailureAlert: location ${locationId} not found`)

  const { data: { user }, error: userErr } = await getSupabase().auth.admin.getUserById(
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

  await getResend().emails.send({
    from: FROM_ADDRESS,
    to: user.email,
    subject,
    text: body,
  })
}
