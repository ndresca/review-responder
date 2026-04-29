'use client'

import { useState, useRef, useCallback, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { LogoFull } from '@/components/LogoFull'
import styles from './onboarding.module.css'

const TOTAL_STEPS = 5

const CALIBRATION_REVIEWS = [
  {
    id: 'calib-1',
    stars: 5,
    type: 'positive' as const,
    review: '"Incredible carbonara. We\'ll definitely be back — the service was warm and attentive throughout."',
    responses: [
      'Thank you so much! We\'re thrilled the carbonara hit the spot — it\'s one of our favourites too. We look forward to welcoming you back soon.',
      'What a lovely thing to hear! The carbonara is a labour of love and we\'re glad it showed. Can\'t wait to have you back.',
      'That means the world to us — thank you. Our team takes real pride in making every visit feel personal. See you next time!',
      'You\'ve made our chef\'s day! The carbonara is close to our hearts and knowing it landed well means everything. Hope to see you again soon.',
    ],
  },
  {
    id: 'calib-2',
    stars: 3,
    type: 'mixed' as const,
    review: '"Good food, a bit noisy. The pasta was excellent but we couldn\'t hear each other talk."',
    responses: [
      'Thank you for the honest feedback — we\'re glad the pasta won you over! We know it can get lively in here, and it\'s something we\'re actively looking at. We hope to see you again.',
      'We appreciate you sharing that — the pasta team will be chuffed! Noise levels are on our radar and we\'re exploring some changes. Hope to welcome you back soon.',
      'Fair point on the noise — we hear you (pun intended). Glad the pasta delivered though! We\'re working on it and would love another chance.',
      'Thanks for keeping it real with us. The pasta\'s our pride and joy, so glad that hit. We\'re taking the noise feedback seriously — some acoustic changes are in the works.',
    ],
  },
  {
    id: 'calib-3',
    stars: 1,
    type: 'negative' as const,
    review: '"Waited 45 minutes for our food. When it arrived, the steak was overcooked and the waiter was dismissive about it."',
    responses: [
      'We\'re sorry your experience fell short — that\'s not the standard we hold ourselves to. We\'d love the chance to make it right. If you\'re open to it, please reach out to us directly and your next visit is on us.',
      'That\'s not okay, and we apologise. A 45-minute wait and an overcooked steak is unacceptable. We\'ve flagged this with our kitchen and floor team. Please reach out — we\'d like to make it up to you.',
      'We dropped the ball here and we\'re sorry. No excuses — you deserved better. We\'re addressing this internally. If you\'d give us another shot, dinner is on us.',
      'This isn\'t who we are, and we\'re genuinely sorry. We\'ve had a direct conversation with our kitchen and front-of-house team about this. We\'d love to invite you back — on the house — to show you what we\'re really about.',
    ],
  },
]

const HOURS = [
  '6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM',
  '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM',
  '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM',
]

const ANALYSIS_MESSAGES = [
  'Connecting to your Google Business Profile...',
  'Reading your review history...',
  'Analyzing your response patterns...',
  'Pre-filling your brand voice...',
]

const LOADING_MESSAGES = [
  'Reading your reviews...',
  'Finding your voice...',
  'Crafting sample responses...',
  'Almost ready...',
]

function starsDisplay(count: number) {
  return '★'.repeat(count) + '☆'.repeat(5 - count)
}

// Next.js requires anything that calls useSearchParams() to live under a
// Suspense boundary so the static prerender can produce a fallback shell
// before client-only search params resolve. The default export below wraps
// this component in <Suspense>.
function OnboardingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // The OAuth callback (src/app/api/auth/google/callback/route.ts) drops the
  // user back at /onboarding?step=2&locationId={uuid} after auth, and the
  // payment success bounce uses ?step=5. Read the param on initial render
  // so deep-linked URLs land on the correct step instead of always step 1.
  const locationId = searchParams.get('locationId')
  const initialStep = (() => {
    const raw = searchParams.get('step')
    if (!raw) return 1
    const n = parseInt(raw, 10)
    return Number.isFinite(n) && n >= 1 && n <= TOTAL_STEPS ? n : 1
  })()
  const [currentStep, setCurrentStep] = useState(initialStep)

  // Analysis loading (after Google connect, before step 2)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [analysisMsg, setAnalysisMsg] = useState(ANALYSIS_MESSAGES[0])

  // Step 2: Brand voice fields (controlled, pre-filled after analysis)
  const [restaurantName, setRestaurantName] = useState('')
  const [brandVoice, setBrandVoice] = useState('')
  const [personality, setPersonality] = useState('')
  const [avoid, setAvoid] = useState('')
  const [language, setLanguage] = useState('en')
  const [autoLang, setAutoLang] = useState(true)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  // Calibration
  const [accepted, setAccepted] = useState<Set<string>>(new Set())
  const [rejections, setRejections] = useState<Record<string, number>>({})
  // Per-card live state. Keyed by the local card id (which becomes the real
  // example UUID after POST returns). reviewSample / aiResponse are swapped
  // in after every successful regen.
  const [cardState, setCardState] = useState<Record<string, {
    exampleId: string | null
    reviewSample: string
    aiResponse: string
  }>>(() => Object.fromEntries(CALIBRATION_REVIEWS.map(r => [r.id, {
    exampleId: null,
    reviewSample: r.review,
    aiResponse: r.responses[0],
  }])))
  // List of card keys to render. Starts as the mock CALIBRATION_REVIEWS ids;
  // once POST returns we swap to real example UUIDs and rebuild cardState.
  const [cardOrder, setCardOrder] = useState<string[]>(CALIBRATION_REVIEWS.map(r => r.id))
  // Map of card key → metadata (stars, type) for rendering. Mirrors
  // CALIBRATION_REVIEWS for the mock seed; populated from scenario_type
  // after POST. Kept separate from cardState so we don't have to refetch
  // it on every regen.
  type CardMeta = { stars: number; type: 'positive' | 'mixed' | 'negative' }
  const [cardMeta, setCardMeta] = useState<Record<string, CardMeta>>(() =>
    Object.fromEntries(CALIBRATION_REVIEWS.map(r => [r.id, { stars: r.stars, type: r.type }])),
  )
  // Per-card loading: card id → in-flight regeneration. Drives the spinner
  // overlay during reject and feedback-submit (both trigger PATCH on the
  // backend, which returns a freshly generated newExample to swap in).
  const [cardLoading, setCardLoading] = useState<Set<string>>(new Set())
  // Page-level calibration loading: drives the full-screen state while the
  // POST runs. POST generates 6 examples in parallel via OpenAI — typically
  // 8–25s of wall time — so this is a real wait, not a fake progress bar.
  const [calibLoading, setCalibLoading] = useState(false)
  const [calibReady, setCalibReady] = useState(false)
  const [calibError, setCalibError] = useState<string | null>(null)
  const [calibSessionId, setCalibSessionId] = useState<string | null>(null)
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0])

  // Digest
  const [digest, setDigest] = useState<'daily' | 'weekly'>('daily')
  const [hourIdx, setHourIdx] = useState(2)
  const [lowAlert, setLowAlert] = useState(false)

  // File upload
  const [fileName, setFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const goToStep = useCallback((n: number) => {
    setCurrentStep(n)
    setValidationErrors({})
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  // Analysis loading effect (after Google connect)
  useEffect(() => {
    if (!analysisLoading) return

    let msgIdx = 0
    const msgInterval = setInterval(() => {
      msgIdx++
      if (msgIdx < ANALYSIS_MESSAGES.length) {
        setAnalysisMsg(ANALYSIS_MESSAGES[msgIdx])
      }
    }, 1000)

    const timers = [
      setTimeout(() => setAnalysisProgress(20), 16),
      setTimeout(() => setAnalysisProgress(45), 500),
      setTimeout(() => setAnalysisProgress(70), 1500),
      setTimeout(() => setAnalysisProgress(90), 2800),
      setTimeout(() => setAnalysisProgress(100), 3500),
      setTimeout(() => {
        clearInterval(msgInterval)
        setAnalysisLoading(false)
        // Pre-fill fields from "analysis"
        setRestaurantName('Cafe Luna')
        setBrandVoice('We\'re a neighbourhood Italian spot that\'s been here since 2012. Regulars call us by name. We\'re warm but not cheesy, local but not provincial. We never say "we apologise for any inconvenience" because that\'s not how real people talk.')
        setPersonality('warm, local, slightly cheeky')
        setLanguage('en')
        goToStep(2)
      }, 4000),
    ]

    return () => {
      clearInterval(msgInterval)
      timers.forEach(clearTimeout)
    }
  }, [analysisLoading, goToStep])

  // Maps the API's scenario_type to the visual metadata each card shows.
  // The visual mapping is purely cosmetic — the backend doesn't care what
  // stars/badge we show next to each card.
  function metaForScenario(scenarioType: string): CardMeta {
    switch (scenarioType) {
      case '5star':            return { stars: 5, type: 'positive' }
      case '4star_minor':      return { stars: 4, type: 'positive' }
      case '3star_mixed':      return { stars: 3, type: 'mixed' }
      case '1star_harsh':      return { stars: 1, type: 'negative' }
      case 'complaint_food':
      case 'complaint_service':
      case 'complaint_wait':   return { stars: 2, type: 'negative' }
      case 'multilingual':     return { stars: 4, type: 'mixed' }
      default:                 return { stars: 3, type: 'mixed' }
    }
  }

  // Calibration POST: fires when the user lands on step 3, generates 6
  // examples in parallel server-side (8–25s of wall time on the OpenAI
  // round-trips). Cycles through LOADING_MESSAGES every ~2.5s while we wait.
  // The cancelled flag handles back-nav cleanly — even if the fetch resolves
  // after we've left the step, we just discard the result instead of
  // setStating into an unmounted view.
  useEffect(() => {
    if (!calibLoading) return

    let cancelled = false
    let msgIdx = 0
    setLoadingMsg(LOADING_MESSAGES[0])
    const msgInterval = setInterval(() => {
      msgIdx = (msgIdx + 1) % LOADING_MESSAGES.length
      setLoadingMsg(LOADING_MESSAGES[msgIdx])
    }, 2500)

    async function run() {
      if (!locationId) {
        if (cancelled) return
        setCalibError('Missing location — open onboarding via the Google connect flow so we know which restaurant to calibrate for.')
        setCalibLoading(false)
        return
      }

      try {
        const res = await fetch('/api/onboarding/calibrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locationId }),
        })
        if (cancelled) return

        if (!res.ok) {
          const body = await res.text().catch(() => '')
          console.error(`POST /api/onboarding/calibrate failed: HTTP ${res.status}`, body)
          setCalibError(
            res.status === 401 ? 'You need to sign in again before we can calibrate.'
            : res.status === 403 ? 'You don\'t have access to this location.'
            : 'We couldn\'t generate sample responses. Try again in a moment.',
          )
          setCalibLoading(false)
          return
        }

        const data = (await res.json()) as {
          sessionId: string
          examples: Array<{
            id: string
            scenario_type: string
            review_sample: string
            ai_response: string
            decision: string
          }>
        }
        if (cancelled) return

        // Rebuild cardState/cardMeta/cardOrder around the real example UUIDs.
        // The mock seed (CALIBRATION_REVIEWS) is replaced wholesale here.
        const newOrder = data.examples.map(e => e.id)
        const newState: typeof cardState = {}
        const newMeta: typeof cardMeta = {}
        for (const ex of data.examples) {
          newState[ex.id] = {
            exampleId: ex.id,
            reviewSample: ex.review_sample,
            aiResponse: ex.ai_response,
          }
          newMeta[ex.id] = metaForScenario(ex.scenario_type)
        }
        setCalibSessionId(data.sessionId)
        setCardOrder(newOrder)
        setCardState(newState)
        setCardMeta(newMeta)
        // Reset per-card decision state so any prior mock interactions don't leak
        setAccepted(new Set())
        setRejections({})
        setCardLoading(new Set())
        setCalibError(null)
        setCalibLoading(false)
        setCalibReady(true)
      } catch (err) {
        if (cancelled) return
        console.error('POST /api/onboarding/calibrate threw:', err)
        setCalibError('Network error — check your connection and try again.')
        setCalibLoading(false)
      }
    }

    run()

    return () => {
      cancelled = true
      clearInterval(msgInterval)
    }
  }, [calibLoading, locationId])

  function startAnalysis() {
    setAnalysisLoading(true)
    setAnalysisProgress(0)
    setAnalysisMsg(ANALYSIS_MESSAGES[0])
  }

  function startCalibLoading() {
    setCalibError(null)
    setCalibReady(false)
    setCalibLoading(true)
  }

  function validateStep2(): boolean {
    const errors: Record<string, string> = {}
    if (!restaurantName.trim()) errors.restaurantName = 'This field is required.'
    if (!brandVoice.trim()) errors.brandVoice = 'This field is required.'
    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  function handleStep2Continue() {
    if (!validateStep2()) return
    goToStep(3)
    startCalibLoading()
  }

  async function handleAccept(localId: string) {
    if (cardLoading.has(localId)) return
    const state = cardState[localId]
    if (!state || !state.exampleId) return

    // Optimistic — flip the card to accepted immediately. If the PATCH fails
    // we roll back so the user can retry. We don't show a spinner here because
    // accept is a passive ack: the server doesn't regen, just records the
    // decision and bumps brand_voices.calibration_examples_accepted (which
    // gates POST /api/onboarding/golive).
    setAccepted((prev) => new Set(prev).add(localId))

    try {
      const res = await fetch('/api/onboarding/calibrate', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exampleId: state.exampleId, decision: 'accepted' }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.error(`PATCH (accept) failed: HTTP ${res.status}`, body)
        setAccepted((prev) => { const next = new Set(prev); next.delete(localId); return next })
      }
      // On success the server updates brand_voices.calibration_examples_accepted
      // automatically; we don't need to read newExample (accept doesn't regen).
    } catch (err) {
      console.error('PATCH (accept) threw:', err)
      setAccepted((prev) => { const next = new Set(prev); next.delete(localId); return next })
    }
  }

  // Helpers to add/remove a card from the in-flight set without mutating state.
  function setCardLoadingFor(id: string, loading: boolean) {
    setCardLoading((prev) => {
      const next = new Set(prev)
      if (loading) next.add(id); else next.delete(id)
      return next
    })
  }

  // PATCH /api/onboarding/calibrate. Returns the regenerated example or null
  // on failure (network, 4xx, 5xx, server-side regen error). The endpoint is
  // documented in src/app/api/onboarding/calibrate/route.ts — server-side
  // regen failure is non-fatal: the original decision is still recorded and
  // the response just contains newExample: null, which we treat the same as
  // a network failure (leave the card unchanged, log, surface nothing to UI).
  async function patchCalibrationExample(
    exampleId: string,
    decision: 'rejected' | 'edited',
    options: { editedText?: string; feedbackText?: string } = {},
  ): Promise<{ id: string; review_sample: string; ai_response: string } | null> {
    try {
      const res = await fetch('/api/onboarding/calibrate', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exampleId,
          decision,
          ...(options.editedText ? { editedText: options.editedText } : {}),
          ...(options.feedbackText ? { feedbackText: options.feedbackText } : {}),
        }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.error(`PATCH /api/onboarding/calibrate failed: HTTP ${res.status}`, body)
        return null
      }
      const data = (await res.json()) as {
        newExample: {
          id: string
          scenario_type: string
          review_sample: string
          ai_response: string
          decision: string
        } | null
      }
      return data.newExample
    } catch (err) {
      console.error('PATCH /api/onboarding/calibrate threw:', err)
      return null
    }
  }

  // Apply a returned newExample to the card's live state.
  function applyNewExample(
    localId: string,
    newExample: { id: string; review_sample: string; ai_response: string },
  ) {
    setCardState(prev => ({
      ...prev,
      [localId]: {
        exampleId: newExample.id,
        reviewSample: newExample.review_sample,
        aiResponse: newExample.ai_response,
      },
    }))
  }

  async function handleReject(localId: string) {
    if (cardLoading.has(localId)) return  // ignore double-clicks while in flight
    const state = cardState[localId]
    if (!state || !state.exampleId) return  // POST not yet successful — nothing real to PATCH against

    setCardLoadingFor(localId, true)
    try {
      const newExample = await patchCalibrationExample(state.exampleId, 'rejected')
      if (newExample) {
        // Re-key cardState/cardMeta around the new example UUID so subsequent
        // interactions target the freshly inserted row. cardOrder swaps the
        // old key for the new in-place so card position is preserved.
        rekeyCard(localId, newExample)
      }
      // Bump rejection count regardless — the user's intent to reject stands
      // even if the regen failed. Two rejections still surface the feedback area.
      // Use the new key if rekey happened, else the old.
      setRejections((prev) => {
        const key = newExample?.id ?? localId
        return { ...prev, [key]: (prev[localId] ?? 0) + 1 }
      })
    } finally {
      setCardLoadingFor(localId, false)
    }
  }

  async function handleFeedbackSubmit(localId: string) {
    if (cardLoading.has(localId)) return
    const state = cardState[localId]
    if (!state || !state.exampleId) return

    // Read the typed feedback from the textarea so the regen prompt can
    // incorporate the owner's note about what the previous response got wrong.
    const feedbackEl = document.getElementById(`feedback-${localId}`) as HTMLTextAreaElement | null
    const feedbackText = feedbackEl?.value.trim() || undefined

    setCardLoadingFor(localId, true)
    try {
      const newExample = await patchCalibrationExample(state.exampleId, 'rejected', { feedbackText })
      if (newExample) {
        rekeyCard(localId, newExample)
      }
      // Reset rejection count so the feedback area hides. After rekey the
      // entry under the old key is gone; under the new key it never existed.
      const newKey = newExample?.id ?? localId
      setRejections((prev) => {
        const next = { ...prev }
        delete next[localId]
        next[newKey] = 0
        return next
      })
    } finally {
      setCardLoadingFor(localId, false)
    }
  }

  // Replace the card identified by oldKey with a fresh row keyed by the new
  // example UUID. Updates cardOrder (in-place), cardState, and cardMeta so
  // every subsequent interaction targets the new id. The old key disappears
  // from all three maps.
  function rekeyCard(
    oldKey: string,
    newExample: { id: string; review_sample: string; ai_response: string },
  ) {
    if (newExample.id === oldKey) {
      // Defensive — the API gives us a new UUID per regen, but if it ever
      // returned the same id (e.g. some future idempotent path), just patch
      // the content without re-keying.
      applyNewExample(oldKey, newExample)
      return
    }
    setCardOrder(prev => prev.map(k => k === oldKey ? newExample.id : k))
    setCardState(prev => {
      const next = { ...prev }
      delete next[oldKey]
      next[newExample.id] = {
        exampleId: newExample.id,
        reviewSample: newExample.review_sample,
        aiResponse: newExample.ai_response,
      }
      return next
    })
    setCardMeta(prev => {
      const next = { ...prev }
      next[newExample.id] = next[oldKey]  // visual metadata stays the same — same scenario_type
      delete next[oldKey]
      return next
    })
  }

  function handleFile(file: File) {
    setFileName(file.name)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.currentTarget.classList.remove(styles.dragover)
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0])
  }

  function handleBack() {
    if (currentStep === 2) goToStep(1)
    else if (currentStep === 3) goToStep(2)
    else if (currentStep === 4) goToStep(3)
    else if (currentStep === 5) goToStep(4)
  }

  return (
    <main className={styles.page}>
      {/* Logo */}
      <header className={styles.pageHeader}>
        <LogoFull className={styles.logoImg} />
      </header>

      {/* Progress bar */}
      <nav className={styles.progressBarWrap} aria-label="Onboarding progress">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => {
          const stepNum = i + 1
          let cls = styles.progressSegment
          if (stepNum < currentStep) cls += ` ${styles.done}`
          else if (stepNum === currentStep) cls += ` ${styles.active}`
          return <div key={stepNum} className={cls} aria-label={`Step ${stepNum} of ${TOTAL_STEPS}`} />
        })}
      </nav>

      {/* Back navigation */}
      {currentStep >= 2 && !analysisLoading && !calibLoading && (
        <div className={styles.backNav}>
          <button className={styles.backLink} onClick={handleBack}>
            ← Back
          </button>
        </div>
      )}

      {/* Analysis loading (between step 1 and step 2) */}
      {analysisLoading && (
        <section className={styles.step} aria-label="Analyzing your profile">
          <div className={styles.calibLoading} role="status" aria-live="polite">
            <div className={styles.calibLoadingInner}>
              <div className={styles.calibLoadingBar}>
                <div className={styles.calibLoadingFill} style={{ width: `${analysisProgress}%` }} />
              </div>
              <p className={styles.calibLoadingText}>{analysisMsg}</p>
            </div>
          </div>
        </section>
      )}

      {/* STEP 1: Connect Google */}
      {currentStep === 1 && !analysisLoading && (
        <section className={styles.step} aria-label="Step 1: Connect Google">
          <div className={styles.connectCard}>
            <div>
              <h1 className={styles.connectHeadline}>Connect your Google account.</h1>
              <p className={styles.connectSub}>
                Connect your Google Business Profile to get started — we&apos;ll handle responses from there.
              </p>
            </div>
            {process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ? (
              <button className={`${styles.btn} ${styles.btnGoogle}`} onClick={startAnalysis}>
                <span className={styles.googleMark} aria-hidden="true">G</span>
                Connect with Google
              </button>
            ) : (
              <a href="/api/auth/google" className={`${styles.btn} ${styles.btnGoogle}`}>
                <span className={styles.googleMark} aria-hidden="true">G</span>
                Connect with Google
              </a>
            )}
            <p className={styles.connectNote}>
              We request read access to your reviews and post permission for responses.<br />
              You can disconnect at any time from Settings.
            </p>
            {/* TODO: remove before launch */}
            <button
              className={styles.skipLink}
              onClick={() => goToStep(2)}
            >
              Skip for now
            </button>
          </div>
        </section>
      )}

      {/* STEP 2: Brand voice */}
      {currentStep === 2 && !analysisLoading && (
        <section className={styles.step} aria-label="Step 2: Describe your brand">
          <h1 className={styles.stepHeadline}>How does your restaurant talk?</h1>
          <p className={styles.stepSub}>
            We pre-filled this from your Google Business Profile and review history. Edit anything that doesn&apos;t feel right.
          </p>

          {/* Required fields */}
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="restaurant-name">
              Restaurant name <span className={styles.fieldRequired}>required</span>
            </label>
            <input
              type="text"
              id="restaurant-name"
              placeholder="e.g. Cafe Luna, The Roasted Vine"
              autoComplete="off"
              className={`${styles.textInput} ${validationErrors.restaurantName ? styles.inputError : ''}`}
              value={restaurantName}
              onChange={(e) => { setRestaurantName(e.target.value); setValidationErrors((prev) => { const next = { ...prev }; delete next.restaurantName; return next }) }}
            />
            {validationErrors.restaurantName && (
              <p className={styles.fieldError}>{validationErrors.restaurantName}</p>
            )}
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="brand-voice">
              Your brand voice <span className={styles.fieldRequired}>required</span>
            </label>
            <textarea
              id="brand-voice"
              rows={5}
              placeholder="Describe your restaurant in your own words — how you talk to customers, phrases you always use, things you'd never say."
              autoComplete="off"
              spellCheck
              className={`${styles.textarea} ${validationErrors.brandVoice ? styles.inputError : ''}`}
              value={brandVoice}
              onChange={(e) => { setBrandVoice(e.target.value); setValidationErrors((prev) => { const next = { ...prev }; delete next.brandVoice; return next }) }}
            />
            {validationErrors.brandVoice && (
              <p className={styles.fieldError}>{validationErrors.brandVoice}</p>
            )}
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="language">
              Primary language <span className={styles.fieldRequired}>required</span>
            </label>
            <select
              id="language"
              className={styles.select}
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="pt">Portuguese</option>
              <option value="it">Italian</option>
              <option value="de">German</option>
              <option value="ja">Japanese</option>
              <option value="zh">Mandarin</option>
              <option value="ar">Arabic</option>
            </select>
          </div>

          {/* Optional section */}
          <p className={styles.optionalSectionLabel}>Optional details</p>

          <div className={styles.optionalFields}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="personality">
                Personality <span className={styles.fieldOptional}>optional</span>
              </label>
              <input
                type="text"
                id="personality"
                placeholder="e.g. warm, local, slightly cheeky"
                autoComplete="off"
                className={styles.textInput}
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="avoid">
                Phrases to avoid <span className={styles.fieldOptional}>optional</span>
              </label>
              <input
                type="text"
                id="avoid"
                placeholder="e.g. We apologise for any inconvenience"
                autoComplete="off"
                className={styles.textInput}
                value={avoid}
                onChange={(e) => setAvoid(e.target.value)}
              />
            </div>

            {/* Multi-language toggle */}
            <div className={styles.fieldToggleRow}>
              <div className={styles.fieldToggleInfo}>
                <span className={styles.fieldLabel}>
                  Respond in the language of each review <span className={styles.fieldOptional}>optional</span>
                </span>
                <span className={styles.fieldToggleSub}>
                  For example: an English review gets an English reply, a Spanish{' '}<br />
                  review gets a Spanish reply, and so on.
                </span>
              </div>
              <button
                className={styles.toggle}
                role="switch"
                aria-checked={autoLang}
                aria-label="Auto-detect review language"
                onClick={() => setAutoLang(!autoLang)}
              >
                <span className={styles.toggleTrack}>
                  <span className={styles.toggleThumb} />
                </span>
              </button>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>
                Upload a brand book or tone guide <span className={styles.fieldOptional}>optional</span>
              </label>
              <div
                className={styles.dropZone}
                tabIndex={0}
                role="button"
                aria-label="Upload a file"
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click() } }}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add(styles.dragover) }}
                onDragLeave={(e) => e.currentTarget.classList.remove(styles.dragover)}
                onDrop={handleDrop}
              >
                <svg className={styles.dropZoneIcon} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span className={styles.dropZoneText}>Drop a file or click to browse</span>
                <span className={styles.dropZoneFormats}>PDF, DOC, DOCX, TXT</span>
                {fileName && <span className={styles.dropZoneFile}>✓ {fileName}</span>}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt,.rtf"
                hidden
                onChange={(e) => { if (e.target.files?.length) handleFile(e.target.files[0]) }}
              />
            </div>
          </div>

          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={handleStep2Continue}
          >
            Continue
          </button>
        </section>
      )}

      {/* STEP 3: Calibration */}
      {currentStep === 3 && (
        <section className={styles.step} aria-label="Step 3: Calibration examples">
          {calibLoading && (
            <div className={styles.calibPageLoading} role="status" aria-live="polite">
              <span className={styles.calibPageSpinner} aria-hidden="true" />
              <p className={styles.calibPageLoadingText}>{loadingMsg}</p>
              <p className={styles.calibPageLoadingSub}>
                Generating 6 sample responses in your voice. This usually takes 10–25 seconds.
              </p>
            </div>
          )}

          {calibError && !calibLoading && (
            <div className={styles.calibErrorWrap} role="alert">
              <p className={styles.calibErrorMsg}>{calibError}</p>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={startCalibLoading}
              >
                Try again
              </button>
              {/* TODO: remove before launch */}
              <button
                className={styles.skipLink}
                onClick={() => goToStep(4)}
              >
                Skip for now
              </button>
            </div>
          )}

          {calibReady && !calibLoading && !calibError && (
            <div>
              <div className={styles.calibrationProgress} role="status" aria-live="polite">
                We generated sample responses based on your real reviews.<br />
                <strong>Accept at least 3 to continue.</strong>{' '}
                <span className={styles.calibrationCount} style={accepted.size >= 3 ? { color: 'var(--success)' } : undefined}>
                  {accepted.size} accepted so far.
                </span>
              </div>

              {cardOrder.map((cardId) => {
                const live = cardState[cardId]
                const meta = cardMeta[cardId]
                if (!live || !meta) return null  // defensive — should never happen with our state mgmt
                const isAccepted = accepted.has(cardId)
                const rejectionCount = rejections[cardId] ?? 0
                const isLoading = cardLoading.has(cardId)
                const starsClass =
                  meta.type === 'positive' ? styles.calibStarsPositive :
                  meta.type === 'mixed' ? styles.calibStarsMixed :
                  styles.calibStarsNegative
                const badgeClass =
                  meta.type === 'positive' ? styles.calibTypePositive :
                  meta.type === 'mixed' ? styles.calibTypeMixed :
                  styles.calibTypeNegative

                return (
                  <article key={cardId} className={`${styles.calibCard} ${isAccepted ? styles.calibCardAccepted : ''}`}>
                    <div className={styles.calibHeader}>
                      <span className={`${styles.calibStars} ${starsClass}`} aria-label={`${meta.stars} stars`}>
                        {starsDisplay(meta.stars)}
                      </span>
                      <span className={`${styles.calibTypeBadge} ${badgeClass}`}>
                        {meta.type.charAt(0).toUpperCase() + meta.type.slice(1)}
                      </span>
                      {isAccepted && (
                        <span className={styles.calibAcceptedBadge} aria-hidden="true">
                          ✓ Accepted
                        </span>
                      )}
                    </div>
                    <p className={styles.calibReview}>{live.reviewSample}</p>

                    {isLoading ? (
                      <div className={styles.calibCardLoading} role="status" aria-live="polite">
                        <span className={styles.calibSpinner} aria-hidden="true" />
                        <span className={styles.calibCardLoadingText}>Generating new response...</span>
                      </div>
                    ) : rejectionCount >= 2 && !isAccepted ? (
                      // After two rejections, the AI response and Looks good /
                      // Not quite buttons hide and we surface the feedback
                      // form. They re-appear once feedback is submitted (which
                      // resets rejectionCount to 0 in handleFeedbackSubmit) so
                      // the user evaluates the regenerated response cleanly.
                      <div className={styles.calibFeedback}>
                        <label className={styles.calibFeedbackLabel} htmlFor={`feedback-${cardId}`}>
                          What didn&apos;t feel right? The more you tell us, the better we&apos;ll match your voice.
                        </label>
                        <textarea
                          id={`feedback-${cardId}`}
                          className={styles.calibFeedbackTextarea}
                          rows={2}
                          placeholder="Optional — skip if you prefer"
                        />
                        <button
                          className={`${styles.btn} ${styles.btnFeedbackSubmit}`}
                          onClick={() => handleFeedbackSubmit(cardId)}
                        >
                          Submit feedback
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className={styles.calibResponseWrap}>
                          <div className={styles.calibResponseTag}>AI response</div>
                          <p className={styles.calibResponseBody}>{live.aiResponse}</p>
                        </div>
                        {!isAccepted && (
                          <div className={styles.calibActions}>
                            <button className={`${styles.btn} ${styles.btnCalibOutline}`} onClick={() => handleAccept(cardId)}>
                              Looks good
                            </button>
                            <button className={`${styles.btn} ${styles.btnCalibOutline}`} onClick={() => handleReject(cardId)}>
                              Not quite
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </article>
                )
              })}

              {accepted.size >= 3 && (
                <div className={styles.goLiveWrap}>
                  <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => goToStep(4)}>
                    Go Live
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* STEP 4: Digest preference */}
      {currentStep === 4 && (
        <section className={styles.step} aria-label="Step 4: Digest preference">
          <h1 className={styles.stepHeadline}>How often do you want a summary?</h1>
          <p className={styles.stepSub}>
            We&apos;ll email you a digest of all responses sent. Pick whatever fits your schedule.
          </p>

          <div className={styles.digestOptions} role="radiogroup" aria-label="Digest frequency">
            <div
              className={`${styles.digestOption} ${digest === 'daily' ? styles.digestOptionSelected : ''}`}
              role="radio"
              aria-checked={digest === 'daily'}
              tabIndex={0}
              onClick={() => setDigest('daily')}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDigest('daily') } }}
            >
              <span className={styles.digestOptionIcon} aria-hidden="true">📅</span>
              <span className={styles.digestOptionLabel}>Daily</span>
              <span className={styles.digestOptionDesc}>A quick morning recap</span>
            </div>
            <div
              className={`${styles.digestOption} ${digest === 'weekly' ? styles.digestOptionSelected : ''}`}
              role="radio"
              aria-checked={digest === 'weekly'}
              tabIndex={0}
              onClick={() => setDigest('weekly')}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDigest('weekly') } }}
            >
              <span className={styles.digestOptionIcon} aria-hidden="true">📊</span>
              <span className={styles.digestOptionLabel}>Weekly</span>
              <span className={styles.digestOptionDesc}>Every Monday morning</span>
            </div>
          </div>

          <div className={styles.alertToggleWrap}>
            <div className={styles.alertToggleRow}>
              <div className={styles.alertToggleInfo}>
                <span className={styles.alertToggleLabel}>Instant alert for low ratings</span>
                <span className={styles.alertToggleDesc}>
                  Send me a push notification immediately when a review under 3 stars is posted.
                </span>
              </div>
              <button
                className={styles.toggle}
                role="switch"
                aria-checked={lowAlert}
                aria-label="Enable instant alerts for low ratings"
                onClick={() => setLowAlert(!lowAlert)}
              >
                <span className={styles.toggleTrack}>
                  <span className={styles.toggleThumb} />
                </span>
              </button>
            </div>
          </div>

          <div className={styles.timeField}>
            <label id="time-label">Send at</label>
            <div className={styles.hourPicker} role="group" aria-labelledby="time-label">
              <button
                className={styles.hourBtn}
                aria-label="Earlier"
                onClick={() => setHourIdx(Math.max(0, hourIdx - 1))}
              >
                −
              </button>
              <div className={styles.hourDisplay} aria-live="polite" aria-atomic="true">
                {HOURS[hourIdx]}
              </div>
              <button
                className={styles.hourBtn}
                aria-label="Later"
                onClick={() => setHourIdx(Math.min(HOURS.length - 1, hourIdx + 1))}
              >
                +
              </button>
            </div>
          </div>

          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => goToStep(5)}
          >
            Continue
          </button>
        </section>
      )}

      {/* STEP 5: Payment */}
      {currentStep === 5 && (
        <section className={styles.step} aria-label="Step 5: Payment">
          <h1 className={styles.paymentHeadline}>Start your 14-day free trial.</h1>
          <p className={styles.paymentSub}>
            You won&apos;t be charged until your trial ends. Cancel anytime.
          </p>
          <p className={styles.paymentPrice}>$29/month</p>

          <button
            className={`${styles.btn} ${styles.btnAmber}`}
            disabled={!locationId}
            onClick={async () => {
              if (!locationId) {
                console.error('Checkout aborted: missing locationId on the page')
                return
              }
              try {
                const res = await fetch('/api/stripe/checkout', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ locationId }),
                })
                if (!res.ok) {
                  const body = await res.text().catch(() => '')
                  console.error(`POST /api/stripe/checkout failed: HTTP ${res.status}`, body)
                  return
                }
                const data = await res.json()
                if (data.url) {
                  window.location.href = data.url
                }
              } catch (err) {
                console.error('Checkout error:', err)
              }
            }}
          >
            Start free trial
          </button>
          {!locationId && (
            <p className={styles.fieldError}>
              Missing location — reconnect your Google account from step 1 before starting your trial.
            </p>
          )}
          <p className={styles.paymentSecured}>Secured by Stripe</p>
        </section>
      )}
    </main>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <OnboardingContent />
    </Suspense>
  )
}
