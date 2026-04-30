import { sanitizeForPrompt } from '@/lib/sanitize'
import type { BrandVoice, CalibrationExample, Review } from '@/lib/types'

function formatVoice(bv: BrandVoice): string {
  // Owner-controlled free-text fields are sanitized before interpolation
  // (strips injection-shaped lines like "Ignore previous instructions").
  const personality = sanitizeForPrompt(bv.personality)
  const avoid = sanitizeForPrompt(bv.avoid)
  const ownerDesc = sanitizeForPrompt(bv.owner_description ?? '')

  const lines: string[] = [
    `Personality: ${personality}`,
    `Never say or imply: ${avoid}`,
  ]
  if (bv.signature_phrases.length > 0) {
    lines.push(`Signature phrases (use occasionally, not in every response): ${bv.signature_phrases.join(', ')}`)
  }
  if (ownerDesc) {
    lines.push(`Owner's own words about their voice:\n${ownerDesc}`)
  }
  return lines.join('\n')
}

function formatExamples(examples: CalibrationExample[]): string {
  return examples
    .map((ex, i) =>
      `Example ${i + 1}:\n` +
      `  Review: "${ex.review_sample}"\n` +
      `  Response: "${ex.ai_response}"`
    )
    .join('\n\n')
}

/**
 * Builds a prompt that generates a response to a real incoming review.
 *
 * Uses accepted calibration examples as few-shot demonstrations of the owner's voice.
 * The AI should return plain text — just the response, nothing else.
 */
export function buildGeneratePrompt(
  brandVoice: BrandVoice,
  calibrationExamples: CalibrationExample[],
  review: Review,
): string {
  const starLabel = `${review.rating}★`
  const reviewerLabel = review.reviewer_name.trim() || 'this customer'

  return `You are responding to a Google review on behalf of a restaurant owner. Your response will be posted publicly and immediately. Match the owner's voice exactly.

RESTAURANT VOICE
────────────────
${formatVoice(brandVoice)}

CALIBRATION EXAMPLES (owner-approved responses — follow this style precisely)
──────────────────────────────────────────────────────────────────────────────
${formatExamples(calibrationExamples)}

RULES
─────
- Write in exactly the same voice as the calibration examples above.
- Reference at least one specific detail ${reviewerLabel} mentioned in their review. Do not respond generically.
- Do NOT invent details about the restaurant that are not in the review (e.g., do not say "I'm glad you loved the pasta" unless they mentioned pasta).
- Do NOT use the reviewer's name unless the calibration examples show the owner does this.
- For negative or mixed reviews: acknowledge the issue genuinely. Do not get defensive. Do not make promises you cannot guarantee.
- For positive reviews: be warm and brief. Do not echo the reviewer's words back verbatim.
- Length: 2–4 sentences maximum.
- Do NOT start the response with "Thank you for your review."
- Do NOT use "we take your feedback seriously" or any variation.
- Do NOT use corporate-speak or filler phrases.
- Respond in ${brandVoice.language}.

NEW REVIEW TO RESPOND TO
─────────────────────────
Rating: ${starLabel}
Reviewer: ${reviewerLabel}
Review: "${review.text}"

Write only the response text. No quotes, no labels, no explanation.`
  // review.text and review.reviewer_name are external strings from Google's
  // GBP API — outside owner control. We don't sanitize them; silent
  // modification could mangle legitimate review content. The LLM quality
  // gate in src/services/auto-post.ts is the defense layer for those.
}
