import { sanitizeForPrompt } from '@/lib/sanitize'
import type { BrandVoice, Review } from '@/lib/types'

/**
 * The structured output the AI should return.
 * Parse with JSON.parse() after calling the model.
 */
export type QualityCheckResult = {
  pass: boolean
  reason: string  // empty string when pass=true; human-readable explanation when pass=false
}

/**
 * Builds a prompt that asks the AI to evaluate a generated response before it
 * is posted publicly. Two failure modes:
 *
 *   1. Brand voice violation — wrong tone, forbidden phrases, or style mismatch
 *   2. Factual hallucination — claims about the restaurant not supported by the review
 *
 * The AI should return JSON matching QualityCheckResult.
 * Parse the response with JSON.parse() in the calling service.
 */
export function buildQualityCheckPrompt(
  brandVoice: BrandVoice,
  generatedResponse: string,
  review: Review,
): string {
  // Owner-controlled fields are sanitized before interpolation. Reviewer-
  // supplied fields (review.text, review.reviewer_name) come from Google's
  // GBP API and are NOT sanitized — they're external strings the owner
  // doesn't control, and silently modifying them could mangle legitimate
  // review content that the quality check needs to evaluate accurately.
  const personality = sanitizeForPrompt(brandVoice.personality)
  const avoid = sanitizeForPrompt(brandVoice.avoid)
  const ownerDesc = sanitizeForPrompt(brandVoice.owner_description ?? '')

  const forbiddenList = [
    avoid,
    'we take your feedback seriously',
    'thank you for your review',
  ]
    .filter(Boolean)
    .map(f => `- "${f}"`)
    .join('\n')

  return `You are a quality-control system for an automated Google review response tool. A restaurant owner has configured a specific voice and style, and an AI has generated a response that is about to be posted publicly.

Your job: decide whether the response is safe to post.

RESTAURANT VOICE
────────────────
Personality: ${personality}
${ownerDesc ? `Owner's description: ${ownerDesc}\n` : ''}
FORBIDDEN PHRASES (any of these = automatic fail)
──────────────────────────────────────────────────
${forbiddenList}

THE REVIEW
───────────
Rating: ${review.rating}★
Reviewer: ${review.reviewer_name}
Review text: "${review.text}"

THE GENERATED RESPONSE
───────────────────────
"${generatedResponse}"

EVALUATION CRITERIA
────────────────────
Check both of the following. Fail on either.

1. BRAND VOICE — does the response:
   - Use any forbidden phrase or close variation of one?
   - Sound corporate, robotic, or generic in a way that contradicts the stated personality?
   - Use a tone clearly at odds with the personality described?

2. FACTUAL CLAIMS — does the response:
   - Make specific claims about the restaurant (dishes, staff names, policies, events) that
     are NOT mentioned or clearly implied by the review text?
   - Reference details the reviewer did not raise?

A response that is merely imperfect or slightly off-tone is NOT a failure — only fail if
it clearly violates the voice or makes up facts that could embarrass the owner if posted.

OUTPUT FORMAT
─────────────
Respond with valid JSON only. No markdown, no explanation outside the JSON.

If the response passes both checks:
{ "pass": true, "reason": "" }

If it fails either check:
{ "pass": false, "reason": "<one sentence explaining exactly what failed and why>" }`
}
