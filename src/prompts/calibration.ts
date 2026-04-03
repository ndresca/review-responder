import type { BrandVoice, ExistingResponse, ScenarioType } from '@/lib/types'

// What each scenario type represents — used to guide sample review generation
const SCENARIO_DESCRIPTIONS: Record<ScenarioType, string> = {
  '5star':            'an enthusiastic 5-star review with specific praise',
  '4star_minor':      'a 4-star review that mentions one small complaint alongside genuine praise',
  '3star_mixed':      'a 3-star review with clear positives and negatives in roughly equal measure',
  '1star_harsh':      'a 1 or 2-star review expressing strong dissatisfaction',
  'complaint_food':   'a negative review focused specifically on food quality, portion size, or temperature',
  'complaint_service':'a negative review focused specifically on staff attitude, attentiveness, or service speed',
  'complaint_wait':   'a negative review focused specifically on wait time — either for a table or for food to arrive',
  'multilingual':     'a review written in the restaurant\'s primary non-English language',
}

function formatVoice(bv: BrandVoice): string {
  const lines: string[] = [
    `Personality: ${bv.personality}`,
    `Never say or imply: ${bv.avoid}`,
  ]
  if (bv.signature_phrases.length > 0) {
    lines.push(`Signature phrases (use occasionally, not in every response): ${bv.signature_phrases.join(', ')}`)
  }
  if (bv.owner_description) {
    lines.push(`Owner's own words about their voice:\n${bv.owner_description}`)
  }
  return lines.join('\n')
}

function formatExistingResponses(responses: ExistingResponse[]): string {
  if (responses.length === 0) return ''
  const examples = responses
    .slice(0, 6)  // cap at 6 to keep the prompt focused
    .map((r, i) =>
      `Example ${i + 1} (${r.review_rating}★):\n` +
      `  Review: "${r.review_text}"\n` +
      `  Response: "${r.response_text}"`
    )
    .join('\n\n')
  return `\nHere are real responses this owner has written in the past. These are the gold standard for their voice:\n\n${examples}`
}

/**
 * Builds a prompt that asks the AI to generate a calibration example —
 * a realistic sample review for the given scenario type and a response to it
 * in the restaurant's voice.
 *
 * The AI should return JSON: { "review_sample": string, "ai_response": string }
 */
export function buildCalibrationPrompt(
  brandVoice: BrandVoice,
  existingResponses: ExistingResponse[],
  scenario: ScenarioType,
): string {
  const scenarioDescription = SCENARIO_DESCRIPTIONS[scenario]
  const isMultilingual = scenario === 'multilingual'
  const languageNote = isMultilingual
    ? `The review should be written in ${brandVoice.language}. The response should also be in ${brandVoice.language}.`
    : 'Both the review and the response should be in English.'

  return `You are helping calibrate an AI system that automatically responds to Google reviews on behalf of a restaurant owner.

Your task has two parts:
1. Write a realistic sample Google review matching this scenario: ${scenarioDescription}.
2. Write the owner's response to that review, perfectly matching their voice and style.

${languageNote}

RESTAURANT VOICE
────────────────
${formatVoice(brandVoice)}
${formatExistingResponses(existingResponses)}

GUIDELINES FOR THE RESPONSE
────────────────────────────
- Match the voice described above exactly. If the owner writes casually, write casually.
- Reference at least one specific detail from the sample review you wrote.
- For negative reviews: acknowledge the issue genuinely, do not get defensive, do not make promises you cannot keep, do not use corporate-speak.
- For positive reviews: express genuine warmth, keep it brief, avoid repeating the reviewer's words back at them verbatim.
- Length: 2–4 sentences. Never a wall of text.
- Do NOT use the phrase "we take your feedback seriously" or any variation of it.
- Do NOT start with "Thank you for your review" — it sounds robotic.
- Do NOT make any factual claims about the restaurant that are not implied by the review itself.

OUTPUT FORMAT
─────────────
Respond with valid JSON only. No markdown, no explanation outside the JSON.

{
  "review_sample": "<the realistic sample review you wrote>",
  "ai_response": "<the owner's response in their voice>"
}`
}
