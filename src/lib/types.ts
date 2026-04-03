export type ScenarioType =
  | '5star'
  | '4star_minor'
  | '3star_mixed'
  | '1star_harsh'
  | 'complaint_food'
  | 'complaint_service'
  | 'complaint_wait'
  | 'multilingual'

export type BrandVoice = {
  personality: string           // e.g. "warm, local, slightly cheeky"
  avoid: string                 // e.g. "never say 'we take your feedback seriously'"
  signature_phrases: string[]   // e.g. ["see you soon!", "come back and see us"]
  language: string              // primary language, e.g. "en" | "es" | "fr"
  owner_description: string | null  // free-text from onboarding
}

export type Review = {
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
