// Pre-generation classifier for reviewer-supplied content from Google Business
// Profile. Flags reviews that look like prompt-injection attempts so the
// auto-post pipeline can route them to human review instead of feeding them
// straight into the LLM.
//
// Used in concert with delimiter-wrapping in the generation/quality-check
// prompts and the post-generation output allowlist (src/lib/output-allowlist.ts).
// Defense in depth — any single layer can be bypassed; all three together
// raise the bar substantially.

const JAILBREAK_PATTERNS: RegExp[] = [
  /ignore\s+(previous|prior|all|the\s+above)\s+instruct/i,
  /disregard\s+(previous|prior|all|the\s+above)/i,
  /forget\s+(your|all|previous|the\s+above)\s+instruct/i,
  /forget\s+(what|everything)/i,
  /new\s+instruct/i,
  /you\s+are\s+now\s+(a|an)\s/i,
  /you\s+must\s+(now|always)\s+/i,
  /respond\s+(only\s+)?with[:\s]/i,
  /reply\s+(only\s+)?with[:\s]/i,
  /override\s+(your|the|previous)/i,
]

const ROLE_TAG_PATTERNS: RegExp[] = [
  /^\s*system\s*:/im,
  /^\s*assistant\s*:/im,
  /^\s*user\s*:/im,
  /^\s*role\s*:/im,
]

const KEYWORD_TRIGGERS = [
  'ignore',
  'system:',
  'assistant:',
  'user:',
  'role:',
]

// Long base64 strings are uncommon in real reviews and a known channel for
// hiding injection payloads. 20 chars is short enough to catch encoded "ignore
// previous" while letting normal alphanumeric tokens through.
const BASE64_PATTERN = /[A-Za-z0-9+/]{20,}={0,2}/

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/gi
const BARE_DOMAIN_PATTERN = /\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|app|biz|info|xyz|me)\b/gi

export type ReviewSafetyResult = {
  safe: boolean
  reason?: string
}

/**
 * Classifies whether a Google review's text is safe to feed into an LLM
 * prompt. Conservative by design — false positives are cheap (the review
 * just needs human review instead of auto-posting), false negatives are
 * expensive (attacker-controlled text reaches the LLM).
 *
 * Caller (src/services/auto-post.ts) skips auto-post and stores the review
 * with status='blocked_pending_regen' + failure_reason set to the returned
 * reason when safe is false.
 */
export function classifyReviewSafety(text: string): ReviewSafetyResult {
  if (!text) return { safe: true }

  const lower = text.toLowerCase()

  for (const re of JAILBREAK_PATTERNS) {
    if (re.test(text)) {
      return { safe: false, reason: `Review text contains jailbreak pattern (${re.source})` }
    }
  }

  for (const re of ROLE_TAG_PATTERNS) {
    if (re.test(text)) {
      return { safe: false, reason: 'Review text contains chat role tag (system:/assistant:/user:/role:)' }
    }
  }

  for (const kw of KEYWORD_TRIGGERS) {
    if (lower.includes(kw)) {
      return { safe: false, reason: `Review text contains injection keyword "${kw}"` }
    }
  }

  if (BASE64_PATTERN.test(text)) {
    return { safe: false, reason: 'Review text contains long base64-shaped string (possible obfuscated payload)' }
  }

  // URLs in review TEXT are uncommon and a strong injection signal — reviewers
  // typically write prose, not links. Bare domains too. Block both.
  if (URL_PATTERN.test(text)) {
    return { safe: false, reason: 'Review text contains URL — flagging for human review' }
  }
  if (BARE_DOMAIN_PATTERN.test(text)) {
    return { safe: false, reason: 'Review text contains bare domain — flagging for human review' }
  }

  return { safe: true }
}
