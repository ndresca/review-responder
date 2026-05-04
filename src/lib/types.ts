export type ScenarioType =
  | '5star'
  | '4star_minor'
  | '3star_mixed'
  | '1star_harsh'
  | 'complaint_food'
  | 'complaint_service'
  | 'complaint_wait'
  | 'multilingual'

// Owner-allowlisted contact channels the AI may reference in review replies.
// `kind` is intentionally NOT modeled — owners choose any channel type
// (Instagram handle, WhatsApp number, TikTok URL, future platforms) without
// being forced through an enum. The eventual validator tokenizes against
// `value`; the prompt surfaces `label` + `when_to_use` as guidance. `id`
// gives the UI stable React keys and lets future code reference a specific
// channel by uuid.
export type ContactChannel = {
  id: string             // uuid v4
  label: string          // owner-typed display name, e.g. "WhatsApp Business"
  value: string          // literal string the AI may insert, e.g. "+1-555-…"
  when_to_use: string    // owner-authored natural-language guidance
}

export type BrandVoice = {
  personality: string           // e.g. "warm, local, slightly cheeky"
  avoid: string                 // e.g. "never say 'we take your feedback seriously'"
  signature_phrases: string[]   // e.g. ["see you soon!", "come back and see us"]
  language: string              // primary language, e.g. "en" | "es" | "fr"
  // When true, the auto-post pipeline detects the review's language and
  // responds in that language. When false, all responses use `language`.
  auto_detect_language: boolean
  owner_description: string | null  // free-text from onboarding
  contact_channels: ContactChannel[]  // PR A foundation; nothing reads this yet
}

export type Review = {
  google_review_id: string      // GBP reviewId — needed to call postReply
  reviewer_name: string
  rating: number                // 1–5
  text: string
  created_at: string
}

// An existing owner-written response fetched from GBP during onboarding
export type ExistingResponse = {
  review_text: string
  review_rating: number
  response_text: string
}

// A calibration example the owner accepted or edited
export type CalibrationExample = {
  scenario_type: ScenarioType
  review_sample: string         // the review the AI responded to
  ai_response: string           // accepted as-is, or owner's edited version
}
