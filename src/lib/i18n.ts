// Autoplier i18n. Two languages: English (default) and Latin-American Spanish.
//
// Translation strings are written for natural restaurant-owner speech, not
// literal translations. No inverted punctuation (no ¡ or ¿) per spec —
// matches the casual register of US-Spanish-speaking restaurateurs.
//
// This file is server-safe (no 'use client', no next/headers import). The
// dictionaries and pure helpers can be imported anywhere.
//   - useTranslation / setLanguage are client-only:  src/lib/i18n-client.ts
//   - getServerTranslation is server-only:           src/lib/i18n-server.ts

export type Lang = 'en' | 'es'
export const LANG_COOKIE = 'autoplier_lang'

// Helpers that take a number and return language-specific strings.
type Counter = (n: number) => string

export type Translation = {
  // ── Landing ────────────────────────────────────────────────────────────
  landingHeroHeadline: string
  landingHeroSub: string
  landingCtaGetStarted: string
  landingTrustLine: string

  landingStepsTitle: string
  landingStep1Label: string
  landingStep1Desc: string
  landingStep2Label: string
  landingStep2Desc: string
  landingStep3Label: string
  landingStep3Desc: string

  landingTestimonial1Quote: string
  landingTestimonial1Source: string
  landingTestimonial2Quote: string
  landingTestimonial2Source: string
  landingTestimonial3Quote: string
  landingTestimonial3Source: string

  landingPricingAmount: string
  landingPricingSub: string
  landingPricingFeature1: string
  landingPricingFeature2: string
  landingPricingFeature3: string
  landingPricingFeature4: string

  landingFooterPrivacy: string

  // ── Common ─────────────────────────────────────────────────────────────
  back: string
  continue: string
  cancel: string
  save: string
  saving: string
  saved: string
  tryAgain: string
  skipForNow: string
  loading: string
  earlierAria: string
  laterAria: string

  languageEnglish: string
  languageSpanish: string
  languageFrench: string
  languagePortuguese: string
  languageItalian: string
  languageGerman: string
  languageJapanese: string
  languageMandarin: string
  languageArabic: string

  // ── Onboarding ─────────────────────────────────────────────────────────
  onbStepAriaTemplate: (n: number, total: number) => string

  onbAnalysis1: string
  onbAnalysis2: string
  onbAnalysis3: string
  onbAnalysis4: string

  onbCalibLoading1: string
  onbCalibLoading2: string
  onbCalibLoading3: string
  onbCalibLoading4: string

  onbStep1Headline: string
  onbStep1Sub: string
  onbStep1Connect: string
  onbStep1Note: string

  onbStep2Headline: string
  onbStep2Sub: string
  onbStep2RestaurantLabel: string
  onbStep2RestaurantPlaceholder: string
  onbStep2VoiceLabel: string
  onbStep2VoicePlaceholder: string
  onbStep2LanguageLabel: string
  onbStep2OptionalSection: string
  onbStep2PersonalityLabel: string
  onbStep2PersonalityPlaceholder: string
  onbStep2AvoidLabel: string
  onbStep2AvoidPlaceholder: string
  onbStep2AutoLangLabel: string
  onbStep2AutoLangSub: string
  onbStep2AutoLangAria: string
  onbStep2UploadLabel: string
  onbStep2DropZoneText: string
  onbStep2DropZoneFormats: string
  onbStep2FieldRequired: string
  onbStep2FieldOptional: string
  onbStep2FieldRequiredError: string

  onbStep3Sub: string
  onbStep3Bold: string
  onbStep3CountSuffix: string
  onbStep3Generating: string
  onbStep3GeneratingSub: string
  onbStep3Accepted: string
  onbStep3LooksGood: string
  onbStep3NotQuite: string
  onbStep3Edit: string
  onbStep3EditLabel: string
  onbStep3FeedbackLabel: string
  onbStep3FeedbackPlaceholder: string
  onbStep3SubmitFeedback: string
  onbStep3AiResponse: string
  onbStep3GoLive: string
  onbStep3TypePositive: string
  onbStep3TypeMixed: string
  onbStep3TypeNegative: string

  onbStep4Headline: string
  onbStep4Sub: string
  onbStep4Daily: string
  onbStep4DailyDesc: string
  onbStep4Weekly: string
  onbStep4WeeklyDesc: string
  onbStep4InstantAlert: string
  onbStep4InstantAlertDesc: string
  onbStep4SendAt: string

  onbStep5Headline: string
  onbStep5Sub: string
  onbStep5Price: string
  onbStep5StartTrial: string
  onbStep5MissingLocation: string
  onbStep5SecuredByStripe: string

  // ── Dashboard ──────────────────────────────────────────────────────────
  dashSettingsLink: string
  dashStatusOn: string
  dashStatusPaused: string
  dashHeadlineOn: string
  dashHeadlinePaused: string
  dashSeeHistory: string
  dashRecentResponses: string
  dashEmptyFeed: string
  dashAnonymous: string
  dashAutoRepliesOn: string
  dashAutoRepliesPaused: string
  dashAutoRepliesAriaOn: string
  dashAutoRepliesAriaPaused: string
  dashLoadError: string
  dashNetworkError: string
  dashWeeklySent: Counter

  timeJustNow: string
  timeYesterday: string
  timeMinutesAgo: Counter
  timeHoursAgo: Counter
  timeDaysAgo: Counter

  // ── Settings ───────────────────────────────────────────────────────────
  setPageTitle: string
  setPausedBanner: string
  setBackToDashboard: string
  setSectionLocation: string
  setSectionVoice: string
  setSectionNotifications: string
  setSectionDanger: string

  setRestaurantNameLabel: string
  setGbpLabel: string
  setGbpConnected: string
  setGbpDisconnected: string
  setGbpDisconnect: string
  setGbpDisconnecting: string
  setGbpDisconnectedNotice1: string
  setGbpReconnect: string
  setGbpDisconnectedNotice2: string

  setPersonalityLabel: string
  setAvoidLabel: string
  setLanguageLabel: string

  setDailyDigest: string
  setDailyDigestSub: (time: string) => string
  setWeeklyDigest: string
  setWeeklyDigestSub: (time: string) => string
  setInstantAlert: string
  setInstantAlertSub: string
  setSendAt: string

  setPauseAutoPosting: string
  setResumeAutoPosting: string
  setPausedSub: string
  setRunningSub: string

  setCancelSubscription: string
  setSubAccessContinues: string
  setSubCanceledNotice: string
  setSubCanceledBadge: string
  setSubCancelDialog: string
  setSubKeep: string
  setSubConfirmCancel: string
  setSubCanceling: string

  setDeleteAccount: string
  setDeleteSub: string
  setDeleteDialog: string
  setDeleteCancel: string
  setDeleteConfirm: string
  setDeleting: string

  setSaveChanges: string
  setSaveSuccess: string
  setSaving: string
  setLoadError: string
  setLoadingText: string
  setUnsavedDialog: string
  setUnsavedSave: string
  setUnsavedDiscard: string

  // ── History ────────────────────────────────────────────────────────────
  histBackToDashboard: string
  histTitle: string
  histRefreshLabel: string
  histLoadingText: string
  histLoadError: string
  histNetworkError: string
  histEmpty: string
  histPosted: string
  histNeedsAttention: string
  histAiResponse: string
  histAnonymous: string

  // ── Error page ─────────────────────────────────────────────────────────
  errGoogleAccessDeniedHead: string
  errGoogleAccessDeniedBody: string
  errTokenExchangeHead: string
  errTokenExchangeBody: string
  errSessionExpiredHead: string
  errSessionExpiredBody: string
  errMissingCodeHead: string
  errMissingCodeBody: string
  errNoAccessTokenHead: string
  errNoAccessTokenBody: string
  errNoRefreshTokenHead: string
  errNoRefreshTokenBody: string
  errUserinfoFetchHead: string
  errUserinfoFetchBody: string
  errUserCreationHead: string
  errUserCreationBody: string
  errRateLimitedHead: string
  errRateLimitedBody: string
  errConfigHead: string
  errConfigBody: string
  errUnknownHead: string
  errUnknownBody: string
  errTryAgain: string
  errContactSupport: string

  // ── Privacy ────────────────────────────────────────────────────────────
  privBackToLanding: string
  privTitle: string
  privEffective: string
  privIntro: string

  privCollectHeading: string
  privCollect1Strong: string
  privCollect1Body: string
  privCollect2Strong: string
  privCollect2Body: string
  privCollect3Strong: string
  privCollect3Body: string

  privUseHeading: string
  privUseBody: string

  privStorageHeading: string
  privStorageBody: string

  privThirdHeading: string
  privThirdIntro: string
  privThirdGoogleStrong: string
  privThirdGoogleBody: string
  privThirdStripeStrong: string
  privThirdStripeBody: string
  privThirdAnthropicStrong: string
  privThirdAnthropicBody: string

  privRetentionHeading: string
  privRetentionBody: string

  privContactHeading: string
  privContactBefore: string
  privContactAfter: string

  // ── EditableResponse component ─────────────────────────────────────────
  editableResponseSent: string
  editableEditReply: string
  editableEditLabel: string
  editableSaveAndResend: string
  editableSending: string
  editableCancel: string
  editableUpdated: string
  editableAiResponse: string

  // ── Language toggle button ─────────────────────────────────────────────
  langToggleLabel: string
}

// ─── English ───────────────────────────────────────────────────────────────

export const EN: Translation = {
  // Landing
  landingHeroHeadline: 'Your Google reviews, handled.',
  landingHeroSub: 'Autoplier reads every new review and posts a response in your voice, automatically. No approval needed.',
  landingCtaGetStarted: 'Get started free',
  landingTrustLine: '14-day free trial. Cancel anytime.',

  landingStepsTitle: 'Set it up once. It runs forever.',
  landingStep1Label: 'Connect your Google Business Profile',
  landingStep1Desc: 'One OAuth tap, takes 30 seconds.',
  landingStep2Label: "Describe your restaurant's voice",
  landingStep2Desc: 'Tell us how you talk to customers. The AI calibrates to match.',
  landingStep3Label: 'Go live',
  landingStep3Desc: 'Every new review gets a response within 15 minutes, automatically posted.',

  landingTestimonial1Quote: '"We used to spend an hour every morning on reviews. Now it just happens. The responses sound exactly like us."',
  landingTestimonial1Source: "Naomi's, Miami",
  landingTestimonial2Quote: '"Even our regulars can\'t tell it\'s AI. It picked up on the way we say \'cheers\' instead of \'thank you\' after two examples."',
  landingTestimonial2Source: 'Bocado Tapas, Worcester',
  landingTestimonial3Quote: '"Set it up on a Tuesday, forgot about it by Thursday. That\'s the whole point."',
  landingTestimonial3Source: "Pink's, Madrid",

  landingPricingAmount: '$29/month — unlimited locations',
  landingPricingSub: '14-day free trial, no credit card required.',
  landingPricingFeature1: 'Automatic responses to every Google review',
  landingPricingFeature2: 'Calibrated to your brand voice',
  landingPricingFeature3: 'Daily or weekly digest email',
  landingPricingFeature4: 'Instant alerts for low-rated reviews',

  landingFooterPrivacy: 'Privacy',

  // Common
  back: '← Back',
  continue: 'Continue',
  cancel: 'Cancel',
  save: 'Save',
  saving: 'Saving...',
  saved: 'Saved ✓',
  tryAgain: 'Try again',
  skipForNow: 'Skip for now',
  loading: 'Loading...',
  earlierAria: 'Earlier',
  laterAria: 'Later',

  languageEnglish: 'English',
  languageSpanish: 'Spanish',
  languageFrench: 'French',
  languagePortuguese: 'Portuguese',
  languageItalian: 'Italian',
  languageGerman: 'German',
  languageJapanese: 'Japanese',
  languageMandarin: 'Mandarin',
  languageArabic: 'Arabic',

  // Onboarding
  onbStepAriaTemplate: (n, total) => `Step ${n} of ${total}`,

  onbAnalysis1: 'Connecting to your Google Business Profile...',
  onbAnalysis2: 'Reading your review history...',
  onbAnalysis3: 'Analyzing your response patterns...',
  onbAnalysis4: 'Pre-filling your brand voice...',

  onbCalibLoading1: 'Reading your reviews...',
  onbCalibLoading2: 'Finding your voice...',
  onbCalibLoading3: 'Crafting sample responses...',
  onbCalibLoading4: 'Almost ready...',

  onbStep1Headline: 'Connect your Google account.',
  onbStep1Sub: "Connect your Google Business Profile to get started — we'll handle responses from there.",
  onbStep1Connect: 'Connect with Google',
  onbStep1Note: 'We request read access to your reviews and post permission for responses. You can disconnect at any time from Settings.',

  onbStep2Headline: 'How does your restaurant talk?',
  onbStep2Sub: "We pre-filled this from your Google Business Profile and review history. Edit anything that doesn't feel right.",
  onbStep2RestaurantLabel: 'Restaurant name',
  onbStep2RestaurantPlaceholder: 'e.g. Cafe Luna, The Roasted Vine',
  onbStep2VoiceLabel: 'Your brand voice',
  onbStep2VoicePlaceholder: "Describe your restaurant in your own words — how you talk to customers, phrases you always use, things you'd never say.",
  onbStep2LanguageLabel: 'Primary language',
  onbStep2OptionalSection: 'Optional details',
  onbStep2PersonalityLabel: 'Personality',
  onbStep2PersonalityPlaceholder: 'e.g. warm, local, slightly cheeky',
  onbStep2AvoidLabel: 'Phrases to avoid',
  onbStep2AvoidPlaceholder: 'e.g. We apologise for any inconvenience',
  onbStep2AutoLangLabel: 'Respond in the language of each review',
  onbStep2AutoLangSub: 'For example: an English review gets an English reply, a Spanish review gets a Spanish reply, and so on.',
  onbStep2AutoLangAria: 'Auto-detect review language',
  onbStep2UploadLabel: 'Upload a brand book or tone guide',
  onbStep2DropZoneText: 'Drop a file or click to browse',
  onbStep2DropZoneFormats: 'PDF, DOC, DOCX, TXT',
  onbStep2FieldRequired: 'required',
  onbStep2FieldOptional: 'optional',
  onbStep2FieldRequiredError: 'This field is required.',

  onbStep3Sub: 'We generated sample responses based on your real reviews.',
  onbStep3Bold: 'Accept at least 3 to continue.',
  onbStep3CountSuffix: 'accepted so far.',
  onbStep3Generating: 'Generating new response...',
  onbStep3GeneratingSub: 'Generating 6 sample responses in your voice. This usually takes 10–25 seconds.',
  onbStep3Accepted: '✓ Accepted',
  onbStep3LooksGood: 'Looks good',
  onbStep3NotQuite: 'Not quite',
  onbStep3Edit: 'Edit',
  onbStep3EditLabel: 'Edit the AI response — your version is what gets saved.',
  onbStep3FeedbackLabel: "What didn't feel right? The more you tell us, the better we'll match your voice.",
  onbStep3FeedbackPlaceholder: 'Optional — skip if you prefer',
  onbStep3SubmitFeedback: 'Submit feedback',
  onbStep3AiResponse: 'AI response',
  onbStep3GoLive: 'Go Live',
  onbStep3TypePositive: 'Positive',
  onbStep3TypeMixed: 'Mixed',
  onbStep3TypeNegative: 'Negative',

  onbStep4Headline: 'How often do you want a summary?',
  onbStep4Sub: "We'll email you a digest of all responses sent. Pick whatever fits your schedule.",
  onbStep4Daily: 'Daily',
  onbStep4DailyDesc: 'A quick morning recap',
  onbStep4Weekly: 'Weekly',
  onbStep4WeeklyDesc: 'Every Monday morning',
  onbStep4InstantAlert: 'Instant alert for low ratings',
  onbStep4InstantAlertDesc: 'Send me a push notification immediately when a review under 3 stars is posted.',
  onbStep4SendAt: 'Send at',

  onbStep5Headline: 'Start your 14-day free trial.',
  onbStep5Sub: "You won't be charged until your trial ends. Cancel anytime.",
  onbStep5Price: '$29/month',
  onbStep5StartTrial: 'Start free trial',
  onbStep5MissingLocation: 'Missing location — reconnect your Google account from step 1 before starting your trial.',
  onbStep5SecuredByStripe: 'Secured by Stripe',

  // Dashboard
  dashSettingsLink: 'Settings',
  dashStatusOn: 'All systems running',
  dashStatusPaused: 'Auto-replies paused',
  dashHeadlineOn: 'Your reviews are handled.',
  dashHeadlinePaused: 'Your reviews are waiting.',
  dashSeeHistory: 'see full history →',
  dashRecentResponses: 'Recent responses',
  dashEmptyFeed: 'No responses yet. New reviews will appear here within 15 minutes of being posted.',
  dashAnonymous: 'Anonymous',
  dashAutoRepliesOn: 'Auto-replies ON',
  dashAutoRepliesPaused: 'Auto-replies PAUSED',
  dashAutoRepliesAriaOn: 'Auto-replies are on. Click to pause.',
  dashAutoRepliesAriaPaused: 'Auto-replies are paused. Click to resume.',
  dashLoadError: "We couldn't load your dashboard. Try refreshing.",
  dashNetworkError: 'Network error — check your connection and try again.',
  dashWeeklySent: (n) => `${n} ${n === 1 ? 'response' : 'responses'} sent this week`,

  timeJustNow: 'Just now',
  timeYesterday: 'Yesterday',
  timeMinutesAgo: (n) => `${n}m ago`,
  timeHoursAgo: (n) => `${n}h ago`,
  timeDaysAgo: (n) => `${n} days ago`,

  // Settings
  setPageTitle: 'Settings',
  setPausedBanner: 'Auto-posting is paused. Reviews are not being responded to.',
  setBackToDashboard: 'Dashboard',
  setSectionLocation: 'Your location',
  setSectionVoice: 'Brand voice',
  setSectionNotifications: 'Notifications',
  setSectionDanger: 'Danger zone',

  setRestaurantNameLabel: 'Restaurant name',
  setGbpLabel: 'Google Business Profile',
  setGbpConnected: 'Connected',
  setGbpDisconnected: 'Disconnected',
  setGbpDisconnect: 'Disconnect',
  setGbpDisconnecting: 'Disconnecting...',
  setGbpDisconnectedNotice1: 'Google Business Profile disconnected. Auto-posting is now off — ',
  setGbpReconnect: 'Reconnect',
  setGbpDisconnectedNotice2: ' to resume.',

  setPersonalityLabel: 'Personality',
  setAvoidLabel: 'Phrases to avoid',
  setLanguageLabel: 'Primary language',

  setDailyDigest: 'Daily digest',
  setDailyDigestSub: (time) => `Sent every morning at ${time}.`,
  setWeeklyDigest: 'Weekly digest',
  setWeeklyDigestSub: (time) => `Sent every Monday morning at ${time}.`,
  setInstantAlert: 'Instant alert for low ratings',
  setInstantAlertSub: 'Notified immediately for reviews under 3 stars',
  setSendAt: 'Send at',

  setPauseAutoPosting: 'Pause auto-posting',
  setResumeAutoPosting: 'Resume auto-posting',
  setPausedSub: 'Auto-posting is currently paused.',
  setRunningSub: 'Responses will stop until you resume.',

  setCancelSubscription: 'Cancel subscription',
  setSubAccessContinues: 'Your access continues until the end of your billing period.',
  setSubCanceledNotice: "Your subscription has been canceled. You'll retain access until the end of your billing period.",
  setSubCanceledBadge: 'Canceled',
  setSubCancelDialog: "Your subscription will be canceled. You'll retain access until the end of your billing period.",
  setSubKeep: 'Keep subscription',
  setSubConfirmCancel: 'Confirm cancellation',
  setSubCanceling: 'Canceling...',

  setDeleteAccount: 'Delete account',
  setDeleteSub: 'This permanently removes your account and all data.',
  setDeleteDialog: 'This will permanently delete your account and all data. This cannot be undone.',
  setDeleteCancel: 'Cancel',
  setDeleteConfirm: 'Delete my account',
  setDeleting: 'Deleting...',

  setSaveChanges: 'Save changes',
  setSaveSuccess: 'Saved ✓',
  setSaving: 'Saving...',
  setLoadError: "We couldn't load your settings. Try refreshing.",
  setLoadingText: 'Loading your settings...',
  setUnsavedDialog: 'You have unsaved changes. Save before leaving?',
  setUnsavedSave: 'Save',
  setUnsavedDiscard: 'Discard',

  // History
  histBackToDashboard: '← Dashboard',
  histTitle: 'Review history.',
  histRefreshLabel: 'Updates every 60 seconds.',
  histLoadingText: 'Loading your history...',
  histLoadError: "We couldn't load your review history. Try refreshing.",
  histNetworkError: 'Network error — check your connection and try again.',
  histEmpty: 'No responses yet. New reviews and replies will appear here within 15 minutes of being posted.',
  histPosted: 'Posted',
  histNeedsAttention: 'Needs attention',
  histAiResponse: 'AI response',
  histAnonymous: 'Anonymous',

  // Error
  errGoogleAccessDeniedHead: 'Connection declined',
  errGoogleAccessDeniedBody: 'You declined to connect your Google account. You can try again from the onboarding page.',
  errTokenExchangeHead: 'Connection error',
  errTokenExchangeBody: 'Something went wrong connecting your Google account. Please try again.',
  errSessionExpiredHead: 'Session expired',
  errSessionExpiredBody: 'Your session expired. Please try again.',
  errMissingCodeHead: 'Connection error',
  errMissingCodeBody: "Google didn't return an authorization code. Please try connecting again.",
  errNoAccessTokenHead: 'Connection error',
  errNoAccessTokenBody: "We couldn't complete the Google sign-in. Please try again.",
  errNoRefreshTokenHead: 'Connection needs a refresh',
  errNoRefreshTokenBody: "Google didn't return a refresh token. Please disconnect and reconnect, choosing your account again when prompted.",
  errUserinfoFetchHead: 'Connection error',
  errUserinfoFetchBody: "We couldn't read your Google account info. Please try again.",
  errUserCreationHead: 'Save failed',
  errUserCreationBody: 'Something went wrong saving your account. Please try again.',
  errRateLimitedHead: 'Too many attempts',
  errRateLimitedBody: 'Too many attempts. Please wait a minute and try again.',
  errConfigHead: 'Configuration error',
  errConfigBody: 'Server configuration error. Please contact support.',
  errUnknownHead: 'Something went wrong',
  errUnknownBody: 'Something unexpected happened. Try again, or contact support if it keeps failing.',
  errTryAgain: 'Try again',
  errContactSupport: 'Contact support',

  // Privacy
  privBackToLanding: '← Landing',
  privTitle: 'Privacy Policy',
  privEffective: 'Effective April 2026',
  privIntro: 'Autoplier is an AI-powered tool that responds to Google reviews on behalf of restaurant owners. This policy explains what data we collect, how we use it, and who we share it with. No legalese — just plain English.',

  privCollectHeading: 'What we collect',
  privCollect1Strong: 'Google account info',
  privCollect1Body: ' — your name, email address, and profile picture, provided when you sign in with Google.',
  privCollect2Strong: 'Google Business Profile data',
  privCollect2Body: ' — your business locations and the reviews posted to them. This is how we know which reviews to respond to.',
  privCollect3Strong: 'Usage data',
  privCollect3Body: ' — basic analytics like page views and feature usage, so we can improve the product. No third-party tracking scripts.',

  privUseHeading: 'How we use it',
  privUseBody: "We use your data for one thing: generating and posting AI responses to your Google reviews, in your voice. Your brand voice settings and calibration examples train the AI to match how you actually talk to customers. We don't use your data to train AI models, sell to advertisers, or anything else.",

  privStorageHeading: 'Data storage',
  privStorageBody: 'Your data is stored securely in Supabase (hosted on AWS). OAuth tokens that grant access to your Google account are encrypted at rest using AES-256-GCM. The encryption key is stored separately from the database and is never exposed to client-side code.',

  privThirdHeading: 'Third parties',
  privThirdIntro: 'We share data with these services, and only these services:',
  privThirdGoogleStrong: 'Google',
  privThirdGoogleBody: ' — OAuth authentication and Google Business Profile API (to read reviews and post responses).',
  privThirdStripeStrong: 'Stripe',
  privThirdStripeBody: ' — payment processing. We never see or store your full card number.',
  privThirdAnthropicStrong: 'Anthropic',
  privThirdAnthropicBody: ' — AI response generation. Review text and your brand voice settings are sent to generate responses. Anthropic does not use this data for model training.',

  privRetentionHeading: 'Data retention',
  privRetentionBody: 'Your data is retained while your account is active. If you cancel your subscription, your data stays available for 30 days in case you change your mind. After that, or upon request, we permanently delete everything — account info, reviews, responses, OAuth tokens, all of it.',

  privContactHeading: 'Contact',
  privContactBefore: 'Questions about your data? Email us at ',
  privContactAfter: ". We'll respond within 48 hours.",

  // EditableResponse
  editableResponseSent: 'Response sent',
  editableEditReply: 'Edit reply',
  editableEditLabel: 'Edit response',
  editableSaveAndResend: 'Save & resend',
  editableSending: 'Sending...',
  editableCancel: 'Cancel',
  editableUpdated: '✓ Updated',
  editableAiResponse: 'AI response',

  // Language toggle
  langToggleLabel: 'ES',
}

// ─── Spanish (Latin American / US Spanish) ────────────────────────────────

export const ES: Translation = {
  // Landing
  landingHeroHeadline: 'Tus reseñas de Google, resueltas.',
  landingHeroSub: 'Autoplier lee cada nueva reseña y responde con tu voz, automáticamente. Sin necesidad de aprobación.',
  landingCtaGetStarted: 'Empezar gratis',
  landingTrustLine: '14 días gratis. Cancela cuando quieras.',

  landingStepsTitle: 'Configura una vez. Funciona para siempre.',
  landingStep1Label: 'Conecta tu Google Business Profile',
  landingStep1Desc: 'Un toque de OAuth, te toma 30 segundos.',
  landingStep2Label: 'Cuéntanos cómo habla tu restaurante',
  landingStep2Desc: 'Dinos cómo te diriges a tus clientes. La IA aprende tu estilo.',
  landingStep3Label: 'Listo para arrancar',
  landingStep3Desc: 'Cada nueva reseña recibe respuesta en menos de 15 minutos, publicada automáticamente.',

  landingTestimonial1Quote: '"Antes nos pasábamos una hora cada mañana respondiendo reseñas. Ahora pasa solo. Las respuestas suenan exactamente como nosotros."',
  landingTestimonial1Source: "Naomi's, Miami",
  landingTestimonial2Quote: '"Hasta nuestros clientes de siempre creen que somos nosotros. Aprendió que decimos \'un abrazo\' en vez de \'gracias\' con solo dos ejemplos."',
  landingTestimonial2Source: 'Bocado Tapas, Worcester',
  landingTestimonial3Quote: '"Lo configuré un martes y para el jueves se me había olvidado. De eso se trata."',
  landingTestimonial3Source: "Pink's, Madrid",

  landingPricingAmount: '$29/mes — locales ilimitados',
  landingPricingSub: '14 días gratis, sin tarjeta de crédito.',
  landingPricingFeature1: 'Respuestas automáticas a cada reseña de Google',
  landingPricingFeature2: 'Calibrada con la voz de tu marca',
  landingPricingFeature3: 'Resumen diario o semanal por correo',
  landingPricingFeature4: 'Avisos al instante para reseñas con calificación baja',

  landingFooterPrivacy: 'Privacidad',

  // Common
  back: '← Atrás',
  continue: 'Continuar',
  cancel: 'Cancelar',
  save: 'Guardar',
  saving: 'Guardando...',
  saved: 'Guardado ✓',
  tryAgain: 'Intentar de nuevo',
  skipForNow: 'Omitir por ahora',
  loading: 'Cargando...',
  earlierAria: 'Antes',
  laterAria: 'Después',

  languageEnglish: 'Inglés',
  languageSpanish: 'Español',
  languageFrench: 'Francés',
  languagePortuguese: 'Portugués',
  languageItalian: 'Italiano',
  languageGerman: 'Alemán',
  languageJapanese: 'Japonés',
  languageMandarin: 'Mandarín',
  languageArabic: 'Árabe',

  // Onboarding
  onbStepAriaTemplate: (n, total) => `Paso ${n} de ${total}`,

  onbAnalysis1: 'Conectando con tu Google Business Profile...',
  onbAnalysis2: 'Revisando tu historial de reseñas...',
  onbAnalysis3: 'Analizando tu manera de responder...',
  onbAnalysis4: 'Preparando la voz de tu marca...',

  onbCalibLoading1: 'Leyendo tus reseñas...',
  onbCalibLoading2: 'Encontrando tu voz...',
  onbCalibLoading3: 'Armando respuestas de muestra...',
  onbCalibLoading4: 'Casi listo...',

  onbStep1Headline: 'Conecta tu cuenta de Google.',
  onbStep1Sub: 'Conecta tu Google Business Profile para empezar — nosotros nos encargamos de las respuestas desde ahí.',
  onbStep1Connect: 'Conectar con Google',
  onbStep1Note: 'Pedimos permiso para leer tus reseñas y publicar respuestas. Puedes desconectar tu cuenta en cualquier momento desde Configuración.',

  onbStep2Headline: 'Cómo habla tu restaurante?',
  onbStep2Sub: 'Llenamos esto con datos de tu Google Business Profile y tu historial de reseñas. Edita lo que no te cuadre.',
  onbStep2RestaurantLabel: 'Nombre del restaurante',
  onbStep2RestaurantPlaceholder: 'ej. Cafe Luna, La Esquina',
  onbStep2VoiceLabel: 'La voz de tu marca',
  onbStep2VoicePlaceholder: 'Describe tu restaurante con tus propias palabras — cómo te diriges a los clientes, frases que usas siempre, cosas que nunca dirías.',
  onbStep2LanguageLabel: 'Idioma principal',
  onbStep2OptionalSection: 'Detalles opcionales',
  onbStep2PersonalityLabel: 'Personalidad',
  onbStep2PersonalityPlaceholder: 'ej. cercano, local, con buen humor',
  onbStep2AvoidLabel: 'Frases que evitar',
  onbStep2AvoidPlaceholder: 'ej. Lamentamos cualquier inconveniente',
  onbStep2AutoLangLabel: 'Responder en el idioma de cada reseña',
  onbStep2AutoLangSub: 'Por ejemplo: una reseña en inglés recibe respuesta en inglés, una en español recibe respuesta en español, y así.',
  onbStep2AutoLangAria: 'Detectar idioma de la reseña',
  onbStep2UploadLabel: 'Sube un manual de marca o guía de tono',
  onbStep2DropZoneText: 'Arrastra un archivo o haz clic para buscar',
  onbStep2DropZoneFormats: 'PDF, DOC, DOCX, TXT',
  onbStep2FieldRequired: 'requerido',
  onbStep2FieldOptional: 'opcional',
  onbStep2FieldRequiredError: 'Este campo es requerido.',

  onbStep3Sub: 'Generamos respuestas de muestra basadas en tus reseñas reales.',
  onbStep3Bold: 'Acepta al menos 3 para continuar.',
  onbStep3CountSuffix: 'aceptadas hasta ahora.',
  onbStep3Generating: 'Generando nueva respuesta...',
  onbStep3GeneratingSub: 'Creando 6 respuestas de muestra con tu voz. Suele tardar entre 10 y 25 segundos.',
  onbStep3Accepted: '✓ Aceptada',
  onbStep3LooksGood: 'Me gusta',
  onbStep3NotQuite: 'No del todo',
  onbStep3Edit: 'Editar',
  onbStep3EditLabel: 'Edita la respuesta de la IA — tu versión es la que se guarda.',
  onbStep3FeedbackLabel: 'Qué no te convenció? Mientras más nos cuentes, mejor te sonamos.',
  onbStep3FeedbackPlaceholder: 'Opcional — déjalo en blanco si prefieres',
  onbStep3SubmitFeedback: 'Enviar comentarios',
  onbStep3AiResponse: 'Respuesta de la IA',
  onbStep3GoLive: 'Salir al aire',
  onbStep3TypePositive: 'Positiva',
  onbStep3TypeMixed: 'Mixta',
  onbStep3TypeNegative: 'Negativa',

  onbStep4Headline: 'Cada cuánto quieres un resumen?',
  onbStep4Sub: 'Te enviamos por correo un resumen de las respuestas. Elige lo que mejor te funcione.',
  onbStep4Daily: 'Diario',
  onbStep4DailyDesc: 'Un repaso rápido por la mañana',
  onbStep4Weekly: 'Semanal',
  onbStep4WeeklyDesc: 'Cada lunes por la mañana',
  onbStep4InstantAlert: 'Alerta inmediata para reseñas bajas',
  onbStep4InstantAlertDesc: 'Mándame una notificación al instante cuando llegue una reseña de menos de 3 estrellas.',
  onbStep4SendAt: 'Enviar a las',

  onbStep5Headline: 'Empieza tu prueba gratis de 14 días.',
  onbStep5Sub: 'No te cobramos hasta que termine la prueba. Cancela cuando quieras.',
  onbStep5Price: '$29/mes',
  onbStep5StartTrial: 'Empezar prueba gratis',
  onbStep5MissingLocation: 'Falta el local — vuelve a conectar tu cuenta de Google desde el paso 1 antes de iniciar la prueba.',
  onbStep5SecuredByStripe: 'Procesado de forma segura por Stripe',

  // Dashboard
  dashSettingsLink: 'Configuración',
  dashStatusOn: 'Todo funcionando',
  dashStatusPaused: 'Respuestas en pausa',
  dashHeadlineOn: 'Tus reseñas están atendidas.',
  dashHeadlinePaused: 'Tus reseñas están esperando.',
  dashSeeHistory: 'ver historial completo →',
  dashRecentResponses: 'Respuestas recientes',
  dashEmptyFeed: 'Aún no hay respuestas. Las nuevas reseñas aparecerán aquí en menos de 15 minutos después de publicarse.',
  dashAnonymous: 'Anónimo',
  dashAutoRepliesOn: 'Respuestas automáticas ACTIVAS',
  dashAutoRepliesPaused: 'Respuestas automáticas EN PAUSA',
  dashAutoRepliesAriaOn: 'Las respuestas automáticas están activas. Haz clic para pausar.',
  dashAutoRepliesAriaPaused: 'Las respuestas automáticas están en pausa. Haz clic para reanudar.',
  dashLoadError: 'No pudimos cargar tu panel. Intenta recargar la página.',
  dashNetworkError: 'Error de red — revisa tu conexión e intenta de nuevo.',
  dashWeeklySent: (n) => `${n} ${n === 1 ? 'respuesta enviada' : 'respuestas enviadas'} esta semana`,

  timeJustNow: 'Ahora mismo',
  timeYesterday: 'Ayer',
  timeMinutesAgo: (n) => `hace ${n}m`,
  timeHoursAgo: (n) => `hace ${n}h`,
  timeDaysAgo: (n) => `hace ${n} ${n === 1 ? 'día' : 'días'}`,

  // Settings
  setPageTitle: 'Configuración',
  setPausedBanner: 'La publicación automática está en pausa. No estamos respondiendo a las reseñas.',
  setBackToDashboard: 'Panel',
  setSectionLocation: 'Tu local',
  setSectionVoice: 'Voz de marca',
  setSectionNotifications: 'Notificaciones',
  setSectionDanger: 'Zona peligrosa',

  setRestaurantNameLabel: 'Nombre del restaurante',
  setGbpLabel: 'Google Business Profile',
  setGbpConnected: 'Conectado',
  setGbpDisconnected: 'Desconectado',
  setGbpDisconnect: 'Desconectar',
  setGbpDisconnecting: 'Desconectando...',
  setGbpDisconnectedNotice1: 'Google Business Profile desconectado. La publicación automática está apagada — ',
  setGbpReconnect: 'Reconectar',
  setGbpDisconnectedNotice2: ' para reanudar.',

  setPersonalityLabel: 'Personalidad',
  setAvoidLabel: 'Frases que evitar',
  setLanguageLabel: 'Idioma principal',

  setDailyDigest: 'Resumen diario',
  setDailyDigestSub: (time) => `Se envía cada mañana a las ${time}.`,
  setWeeklyDigest: 'Resumen semanal',
  setWeeklyDigestSub: (time) => `Se envía cada lunes por la mañana a las ${time}.`,
  setInstantAlert: 'Alerta inmediata para reseñas bajas',
  setInstantAlertSub: 'Aviso al instante para reseñas de menos de 3 estrellas',
  setSendAt: 'Enviar a las',

  setPauseAutoPosting: 'Pausar publicación automática',
  setResumeAutoPosting: 'Reanudar publicación automática',
  setPausedSub: 'La publicación automática está en pausa.',
  setRunningSub: 'Las respuestas se detendrán hasta que reanudes.',

  setCancelSubscription: 'Cancelar suscripción',
  setSubAccessContinues: 'Mantienes acceso hasta el fin del período de facturación.',
  setSubCanceledNotice: 'Tu suscripción fue cancelada. Mantienes acceso hasta el fin del período de facturación.',
  setSubCanceledBadge: 'Cancelada',
  setSubCancelDialog: 'Tu suscripción se va a cancelar. Mantienes acceso hasta el fin del período de facturación.',
  setSubKeep: 'Conservar suscripción',
  setSubConfirmCancel: 'Confirmar cancelación',
  setSubCanceling: 'Cancelando...',

  setDeleteAccount: 'Eliminar cuenta',
  setDeleteSub: 'Esto borra tu cuenta y todos los datos de forma permanente.',
  setDeleteDialog: 'Esto borra tu cuenta y todos los datos de forma permanente. No se puede deshacer.',
  setDeleteCancel: 'Cancelar',
  setDeleteConfirm: 'Eliminar mi cuenta',
  setDeleting: 'Eliminando...',

  setSaveChanges: 'Guardar cambios',
  setSaveSuccess: 'Guardado ✓',
  setSaving: 'Guardando...',
  setLoadError: 'No pudimos cargar tu configuración. Intenta recargar la página.',
  setLoadingText: 'Cargando tu configuración...',
  setUnsavedDialog: 'Tienes cambios sin guardar. Los guardamos antes de salir?',
  setUnsavedSave: 'Guardar',
  setUnsavedDiscard: 'Descartar',

  // History
  histBackToDashboard: '← Panel',
  histTitle: 'Historial de reseñas.',
  histRefreshLabel: 'Se actualiza cada 60 segundos.',
  histLoadingText: 'Cargando tu historial...',
  histLoadError: 'No pudimos cargar tu historial. Intenta recargar la página.',
  histNetworkError: 'Error de red — revisa tu conexión e intenta de nuevo.',
  histEmpty: 'Aún no hay respuestas. Las reseñas y respuestas nuevas aparecerán aquí en menos de 15 minutos después de publicarse.',
  histPosted: 'Publicada',
  histNeedsAttention: 'Necesita atención',
  histAiResponse: 'Respuesta de la IA',
  histAnonymous: 'Anónimo',

  // Error
  errGoogleAccessDeniedHead: 'Conexión rechazada',
  errGoogleAccessDeniedBody: 'No autorizaste la conexión con tu cuenta de Google. Puedes intentarlo de nuevo desde la página de inicio.',
  errTokenExchangeHead: 'Error de conexión',
  errTokenExchangeBody: 'Algo falló al conectar con tu cuenta de Google. Por favor intenta de nuevo.',
  errSessionExpiredHead: 'Sesión expirada',
  errSessionExpiredBody: 'Tu sesión expiró. Por favor intenta de nuevo.',
  errMissingCodeHead: 'Error de conexión',
  errMissingCodeBody: 'Google no devolvió un código de autorización. Por favor intenta conectarte de nuevo.',
  errNoAccessTokenHead: 'Error de conexión',
  errNoAccessTokenBody: 'No pudimos completar el inicio de sesión con Google. Por favor intenta de nuevo.',
  errNoRefreshTokenHead: 'La conexión necesita renovarse',
  errNoRefreshTokenBody: 'Google no devolvió un token de refresco. Desconecta y vuelve a conectar, eligiendo tu cuenta cuando se te pida.',
  errUserinfoFetchHead: 'Error de conexión',
  errUserinfoFetchBody: 'No pudimos leer la información de tu cuenta de Google. Por favor intenta de nuevo.',
  errUserCreationHead: 'Error al guardar',
  errUserCreationBody: 'Algo falló al guardar tu cuenta. Por favor intenta de nuevo.',
  errRateLimitedHead: 'Demasiados intentos',
  errRateLimitedBody: 'Demasiados intentos. Por favor espera un minuto e intenta de nuevo.',
  errConfigHead: 'Error de configuración',
  errConfigBody: 'Error de configuración del servidor. Por favor contacta a soporte.',
  errUnknownHead: 'Algo salió mal',
  errUnknownBody: 'Pasó algo inesperado. Intenta de nuevo, o contacta a soporte si el problema persiste.',
  errTryAgain: 'Intentar de nuevo',
  errContactSupport: 'Contactar a soporte',

  // Privacy
  privBackToLanding: '← Inicio',
  privTitle: 'Política de Privacidad',
  privEffective: 'Vigente desde abril de 2026',
  privIntro: 'Autoplier es una herramienta con IA que responde a las reseñas de Google en nombre de los dueños de restaurantes. Esta política explica qué datos recopilamos, cómo los usamos, y con quién los compartimos. Sin tecnicismos legales — todo en español sencillo.',

  privCollectHeading: 'Qué recopilamos',
  privCollect1Strong: 'Datos de tu cuenta de Google',
  privCollect1Body: ' — tu nombre, dirección de correo, y foto de perfil, que nos das al iniciar sesión con Google.',
  privCollect2Strong: 'Datos de tu Google Business Profile',
  privCollect2Body: ' — tus locales y las reseñas publicadas en ellos. Así sabemos a qué reseñas responder.',
  privCollect3Strong: 'Datos de uso',
  privCollect3Body: ' — métricas básicas como vistas de página y uso de funciones, para mejorar el producto. Sin scripts de rastreo de terceros.',

  privUseHeading: 'Cómo los usamos',
  privUseBody: 'Usamos tus datos para una sola cosa: generar y publicar respuestas con IA a tus reseñas de Google, con tu voz. La configuración de la voz de tu marca y los ejemplos de calibración entrenan a la IA para que suene como tú hablas con los clientes. No usamos tus datos para entrenar modelos de IA, venderlos a anunciantes, ni nada parecido.',

  privStorageHeading: 'Almacenamiento de datos',
  privStorageBody: 'Tus datos se guardan de forma segura en Supabase (alojado en AWS). Los tokens de OAuth que dan acceso a tu cuenta de Google están encriptados con AES-256-GCM. La clave de encriptación se guarda separada de la base de datos y nunca queda expuesta al lado del cliente.',

  privThirdHeading: 'Terceros',
  privThirdIntro: 'Compartimos datos con estos servicios, y solo con estos servicios:',
  privThirdGoogleStrong: 'Google',
  privThirdGoogleBody: ' — autenticación OAuth y Google Business Profile API (para leer reseñas y publicar respuestas).',
  privThirdStripeStrong: 'Stripe',
  privThirdStripeBody: ' — procesamiento de pagos. Nunca vemos ni guardamos el número completo de tu tarjeta.',
  privThirdAnthropicStrong: 'Anthropic',
  privThirdAnthropicBody: ' — generación de respuestas con IA. El texto de las reseñas y la configuración de tu voz se envían para generar respuestas. Anthropic no usa estos datos para entrenar modelos.',

  privRetentionHeading: 'Retención de datos',
  privRetentionBody: 'Tus datos se conservan mientras tu cuenta esté activa. Si cancelas tu suscripción, tus datos siguen disponibles 30 días por si cambias de opinión. Después, o cuando lo solicites, eliminamos todo de forma permanente — datos de cuenta, reseñas, respuestas, tokens de OAuth, todo.',

  privContactHeading: 'Contacto',
  privContactBefore: 'Tienes preguntas sobre tus datos? Escríbenos a ',
  privContactAfter: '. Te respondemos en menos de 48 horas.',

  // EditableResponse
  editableResponseSent: 'Respuesta enviada',
  editableEditReply: 'Editar respuesta',
  editableEditLabel: 'Editar respuesta',
  editableSaveAndResend: 'Guardar y reenviar',
  editableSending: 'Enviando...',
  editableCancel: 'Cancelar',
  editableUpdated: '✓ Actualizada',
  editableAiResponse: 'Respuesta de la IA',

  // Language toggle
  langToggleLabel: 'EN',
}

// ─── Pure helpers (server-safe) ───────────────────────────────────────────

export function getTranslation(lang: Lang): Translation {
  return lang === 'es' ? ES : EN
}

export function parseLang(raw: string | undefined | null): Lang {
  return raw === 'es' ? 'es' : 'en'
}
