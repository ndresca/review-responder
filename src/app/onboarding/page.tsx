'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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

export default function OnboardingPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)

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
  const [responseIdx, setResponseIdx] = useState<Record<string, number>>({})
  const [feedbackSubmitting, setFeedbackSubmitting] = useState<string | null>(null)
  const [calibLoading, setCalibLoading] = useState(false)
  const [calibReady, setCalibReady] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState(0)
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

  // Calibration loading effect
  useEffect(() => {
    if (!calibLoading) return

    let msgIdx = 0
    const msgInterval = setInterval(() => {
      msgIdx++
      if (msgIdx < LOADING_MESSAGES.length) {
        setLoadingMsg(LOADING_MESSAGES[msgIdx])
      }
    }, 800)

    const timers = [
      setTimeout(() => setLoadingProgress(15), 16),
      setTimeout(() => setLoadingProgress(40), 400),
      setTimeout(() => setLoadingProgress(70), 1200),
      setTimeout(() => setLoadingProgress(90), 2200),
      setTimeout(() => setLoadingProgress(100), 2800),
      setTimeout(() => {
        clearInterval(msgInterval)
        setCalibLoading(false)
        setCalibReady(true)
      }, 3200),
    ]

    return () => {
      clearInterval(msgInterval)
      timers.forEach(clearTimeout)
    }
  }, [calibLoading])

  function startAnalysis() {
    setAnalysisLoading(true)
    setAnalysisProgress(0)
    setAnalysisMsg(ANALYSIS_MESSAGES[0])
  }

  function startCalibLoading() {
    setCalibLoading(true)
    setCalibReady(false)
    setLoadingProgress(0)
    setLoadingMsg(LOADING_MESSAGES[0])
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
    setCalibReady(true)
  }

  function handleAccept(id: string) {
    setAccepted((prev) => new Set(prev).add(id))
  }

  function handleReject(id: string) {
    const review = CALIBRATION_REVIEWS.find((r) => r.id === id)
    if (!review) return
    const currentIdx = responseIdx[id] ?? 0
    const nextIdx = currentIdx + 1
    if (nextIdx < review.responses.length) {
      setResponseIdx((prev) => ({ ...prev, [id]: nextIdx }))
    }
    setRejections((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }))
  }

  function handleFeedbackSubmit(id: string) {
    const review = CALIBRATION_REVIEWS.find((r) => r.id === id)
    if (!review) return
    setFeedbackSubmitting(id)
    setTimeout(() => {
      // Advance to the next response variant (the "improved" one after feedback)
      const currentIdx = responseIdx[id] ?? 0
      const nextIdx = currentIdx + 1
      if (nextIdx < review.responses.length) {
        setResponseIdx((prev) => ({ ...prev, [id]: nextIdx }))
      }
      setFeedbackSubmitting(null)
      // Reset rejection count so the feedback area hides
      setRejections((prev) => ({ ...prev, [id]: 0 }))
    }, 1500)
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
        <div className={styles.logoPlaceholder} aria-hidden="true">
          <span className={styles.logoPlaceholderText}>Your Logo</span>
        </div>
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
            <div className={styles.calibLoading} role="status" aria-live="polite">
              <div className={styles.calibLoadingInner}>
                <div className={styles.calibLoadingBar}>
                  <div className={styles.calibLoadingFill} style={{ width: `${loadingProgress}%` }} />
                </div>
                <p className={styles.calibLoadingText}>{loadingMsg}</p>
              </div>
            </div>
          )}

          {calibReady && (
            <div>
              <div className={styles.calibrationProgress} role="status" aria-live="polite">
                We generated sample responses based on your real reviews.<br />
                <strong>Accept at least 3 to continue.</strong>{' '}
                <span className={styles.calibrationCount} style={accepted.size >= 3 ? { color: 'var(--success)' } : undefined}>
                  {accepted.size} accepted so far.
                </span>
              </div>

              {CALIBRATION_REVIEWS.map((review) => {
                const isAccepted = accepted.has(review.id)
                const currentResponseIdx = responseIdx[review.id] ?? 0
                const rejectionCount = rejections[review.id] ?? 0
                const isSubmittingFeedback = feedbackSubmitting === review.id
                const starsClass =
                  review.type === 'positive' ? styles.calibStarsPositive :
                  review.type === 'mixed' ? styles.calibStarsMixed :
                  styles.calibStarsNegative
                const badgeClass =
                  review.type === 'positive' ? styles.calibTypePositive :
                  review.type === 'mixed' ? styles.calibTypeMixed :
                  styles.calibTypeNegative

                return (
                  <article key={review.id} className={`${styles.calibCard} ${isAccepted ? styles.calibCardAccepted : ''}`}>
                    <div className={styles.calibHeader}>
                      <span className={`${styles.calibStars} ${starsClass}`} aria-label={`${review.stars} stars`}>
                        {starsDisplay(review.stars)}
                      </span>
                      <span className={`${styles.calibTypeBadge} ${badgeClass}`}>
                        {review.type.charAt(0).toUpperCase() + review.type.slice(1)}
                      </span>
                      {isAccepted && (
                        <span className={styles.calibAcceptedBadge} aria-hidden="true">
                          ✓ Accepted
                        </span>
                      )}
                    </div>
                    <p className={styles.calibReview}>{review.review}</p>
                    <div className={styles.calibResponseWrap}>
                      <div className={styles.calibResponseTag}>AI response</div>
                      <p className={styles.calibResponseBody}>{review.responses[currentResponseIdx]}</p>
                    </div>
                    {rejectionCount >= 2 && !isAccepted && (
                      <div className={styles.calibFeedback}>
                        <label className={styles.calibFeedbackLabel} htmlFor={`feedback-${review.id}`}>
                          What didn&apos;t feel right? The more you tell us, the better we&apos;ll match your voice.
                        </label>
                        <textarea
                          id={`feedback-${review.id}`}
                          className={styles.calibFeedbackTextarea}
                          rows={2}
                          placeholder="Optional — skip if you prefer"
                          disabled={isSubmittingFeedback}
                        />
                        <button
                          className={`${styles.btn} ${styles.btnFeedbackSubmit}`}
                          onClick={() => handleFeedbackSubmit(review.id)}
                          disabled={isSubmittingFeedback}
                        >
                          {isSubmittingFeedback ? 'Updating response...' : 'Submit feedback'}
                        </button>
                      </div>
                    )}
                    {!isAccepted && !isSubmittingFeedback && (
                      <div className={styles.calibActions}>
                        <button className={`${styles.btn} ${styles.btnCalibOutline}`} onClick={() => handleAccept(review.id)}>
                          Looks good
                        </button>
                        <button className={`${styles.btn} ${styles.btnCalibOutline}`} onClick={() => handleReject(review.id)}>
                          Not quite
                        </button>
                      </div>
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

          <div className={styles.paymentCardWrap}>
            <div className={styles.paymentCardRow}>
              <input
                type="text"
                className={styles.paymentCardInput}
                placeholder="1234 5678 9012 3456"
                aria-label="Card number"
                style={{ flex: 2 }}
                readOnly
              />
              <input
                type="text"
                className={styles.paymentCardInput}
                placeholder="MM / YY"
                aria-label="Expiry date"
                style={{ flex: 1 }}
                readOnly
              />
              <input
                type="text"
                className={styles.paymentCardInput}
                placeholder="CVC"
                aria-label="CVC"
                style={{ flex: 0.7 }}
                readOnly
              />
            </div>
          </div>

          <button
            className={`${styles.btn} ${styles.btnAmber}`}
            onClick={() => router.push('/dashboard')}
          >
            Start free trial
          </button>
          <p className={styles.paymentSecured}>Secured by Stripe</p>
        </section>
      )}
    </main>
  )
}
