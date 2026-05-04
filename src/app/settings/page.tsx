'use client'

import { useState, useCallback, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ContactChannelsForm } from '@/components/ContactChannelsForm'
import { Footer } from '@/components/Footer'
import { useTranslation } from '@/lib/i18n-client'
import type { ContactChannel } from '@/lib/types'
import styles from './settings.module.css'

const HOURS = [
  '6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM',
  '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM',
  '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM',
]

// HOURS starts at 6am — convert between digest_time (0–23 hour) and the
// picker's index. clamp() keeps an out-of-range stored hour from breaking
// the UI (5am or 10pm just snap to nearest visible).
function hourIdxToTime(idx: number): number {
  return 6 + idx
}

function timeToHourIdx(hour: number): number {
  const idx = hour - 6
  if (idx < 0) return 0
  if (idx >= HOURS.length) return HOURS.length - 1
  return idx
}

// Empty-state defaults used until the load endpoint resolves and when the
// load returns null/empty rows (new accounts that haven't completed onboarding).
const EMPTY_DEFAULTS = {
  restaurantName: '',
  personality: '',
  avoid: '',
  language: 'en',
  autoDetectLanguage: false,
  daily: true,
  weekly: false,
  lowAlert: false,
  hourIdx: 2,
  contactChannels: [] as ContactChannel[],
}

type LoadResponse = {
  locationId: string | null
  restaurantName: string | null
  email: string | null
  brandVoice: {
    personality: string
    avoid: string
    language: string
    autoDetectLanguage: boolean
    ownerDescription: string | null
    contactChannels?: ContactChannel[]
  } | null
  notifications: {
    frequency: 'daily' | 'weekly'
    digestDay: number | null
    digestTime: number
    timezone: string | null
    failureAlerts: boolean
  } | null
  subscription: {
    status: string
    currentPeriodEnd: string | null
  } | null
  autoPostEnabled: boolean
}

function Toggle({
  id, checked, onChange, label,
}: {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <button
      className={styles.toggle}
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.toggleTrack}>
        <span className={styles.toggleThumb} />
      </span>
    </button>
  )
}

function SettingsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useTranslation()
  // URL param is a fallback; the load endpoint is authoritative for which
  // location this owner edits. The param exists so direct links to
  // /settings?locationId=... still work for QA.
  const locationIdFromUrl = searchParams.get('locationId')
  const [locationId, setLocationId] = useState<string | null>(locationIdFromUrl)

  // Form state — all editable inline, all dirty-tracked. Seeded with
  // empty defaults; the load effect populates from real DB rows on mount.
  const [restaurantName, setRestaurantName] = useState(EMPTY_DEFAULTS.restaurantName)
  const [personality, setPersonality] = useState(EMPTY_DEFAULTS.personality)
  const [avoid, setAvoid] = useState(EMPTY_DEFAULTS.avoid)
  const [language, setLanguage] = useState(EMPTY_DEFAULTS.language)
  const [autoDetectLanguage, setAutoDetectLanguage] = useState(EMPTY_DEFAULTS.autoDetectLanguage)
  const [daily, setDaily] = useState(EMPTY_DEFAULTS.daily)
  const [weekly, setWeekly] = useState(EMPTY_DEFAULTS.weekly)
  const [lowAlert, setLowAlert] = useState(EMPTY_DEFAULTS.lowAlert)
  const [hourIdx, setHourIdx] = useState(EMPTY_DEFAULTS.hourIdx)
  // Contact channels state. Stored as array of ContactChannel; the form
  // component manages add/edit/delete via setContactChannels. Dirty
  // tracking uses JSON.stringify since reference identity changes on
  // every keystroke inside the form.
  const [contactChannels, setContactChannels] = useState<ContactChannel[]>(
    EMPTY_DEFAULTS.contactChannels,
  )

  // Initial-load state. While loading, the form sections are replaced with a
  // centered spinner so we don't briefly show the empty defaults as if they
  // were the user's saved settings. loadError is non-fatal — page still
  // renders, fields just stay at defaults and a small notice shows up.
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // UI state. paused mirrors brand_voices.auto_post_enabled (inverted) — true
  // here means auto-post is OFF. Hydrated from /api/settings/load on mount;
  // toggled via /api/settings/toggle-auto-post (shared with the dashboard pill).
  const [paused, setPaused] = useState(false)
  const [pauseToggling, setPauseToggling] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showCancelSub, setShowCancelSub] = useState(false)
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)

  // Save flow
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Cancel-subscription flow
  const [cancelingSubInFlight, setCancelingSubInFlight] = useState(false)
  const [subCanceled, setSubCanceled] = useState(false)

  // Delete-account flow
  const [deleting, setDeleting] = useState(false)

  // Email + GBP disconnect flow
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [gbpDisconnecting, setGbpDisconnecting] = useState(false)
  const [gbpDisconnected, setGbpDisconnected] = useState(false)

  // Saved snapshot for dirty checking. Bumping savedVersion forces re-render
  // after save. Initialised to the empty defaults so isDirty() is false on
  // mount; replaced with the actual loaded values once the load fetch resolves.
  const savedRef = useRef({ ...EMPTY_DEFAULTS })
  const [, setSavedVersion] = useState(0)

  // ── Initial load ─────────────────────────────────────────────────────────
  // Fetches the owner's first location + brand voice + notification prefs
  // from /api/settings/load, populates state. Cancelled flag prevents
  // setStating after unmount (e.g. if the user navigates away mid-fetch).
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/settings/load')
        if (cancelled) return

        if (res.status === 401) {
          // Same expired-JWT recovery as /dashboard and /history. Refresh
          // route mints a fresh sb-* JWT from autoplier_refresh and
          // bounces back here, or sends to /onboarding if both tokens
          // are gone.
          router.push('/api/auth/refresh?next=/settings')
          return
        }

        if (!res.ok) {
          const body = await res.text().catch(() => '')
          console.error(`GET /api/settings/load failed: HTTP ${res.status}`, body)
          setLoadError(t.setLoadError)
          return
        }

        const data = (await res.json()) as LoadResponse
        if (cancelled) return

        // locationId from API takes precedence over the URL param — the
        // server resolves "the owner's first location" definitively.
        if (data.locationId) setLocationId(data.locationId)
        setUserEmail(data.email)

        // Apply each block independently so a partially-onboarded account
        // (brand_voices set, notifications not) still gets what it has.
        const next = { ...EMPTY_DEFAULTS }

        if (data.restaurantName) next.restaurantName = data.restaurantName

        if (data.brandVoice) {
          next.personality = data.brandVoice.personality ?? ''
          next.avoid = data.brandVoice.avoid ?? ''
          next.language = data.brandVoice.language ?? 'en'
          next.autoDetectLanguage = data.brandVoice.autoDetectLanguage ?? false
          if (Array.isArray(data.brandVoice.contactChannels)) {
            next.contactChannels = data.brandVoice.contactChannels
          }
        }

        if (data.notifications) {
          next.daily = data.notifications.frequency === 'daily'
          next.weekly = data.notifications.frequency === 'weekly'
          next.hourIdx = timeToHourIdx(data.notifications.digestTime)
        }

        // Hydrate the danger-zone Pause/Resume button. paused === !autoPostEnabled.
        setPaused(!data.autoPostEnabled)

        // Push into state.
        setRestaurantName(next.restaurantName)
        setPersonality(next.personality)
        setAvoid(next.avoid)
        setLanguage(next.language)
        setAutoDetectLanguage(next.autoDetectLanguage)
        setDaily(next.daily)
        setWeekly(next.weekly)
        setHourIdx(next.hourIdx)
        setContactChannels(next.contactChannels)

        // Reset the dirty baseline to the loaded values so the save button
        // stays hidden until the user actually edits. Deep-copy the channels
        // array so mutations to component state don't drift the baseline.
        savedRef.current = {
          ...next,
          contactChannels: JSON.parse(JSON.stringify(next.contactChannels)) as ContactChannel[],
        }
        setSavedVersion(v => v + 1)
      } catch (err) {
        if (cancelled) return
        console.error('GET /api/settings/load threw:', err)
        setLoadError(t.setLoadError)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => { cancelled = true }
  }, [])

  const isDirty = useCallback(() => {
    const s = savedRef.current
    return (
      restaurantName !== s.restaurantName ||
      personality !== s.personality ||
      avoid !== s.avoid ||
      language !== s.language ||
      autoDetectLanguage !== s.autoDetectLanguage ||
      daily !== s.daily ||
      weekly !== s.weekly ||
      lowAlert !== s.lowAlert ||
      hourIdx !== s.hourIdx ||
      // Channels are arrays of objects — JSON.stringify is the cheapest
      // structural compare available without a deps lib. Order matters
      // (the form preserves insertion order), so this also catches reorder.
      JSON.stringify(contactChannels) !== JSON.stringify(s.contactChannels)
    )
  }, [restaurantName, personality, avoid, language, autoDetectLanguage, daily, weekly, lowAlert, hourIdx, contactChannels])

  function handleDaily(on: boolean) {
    setDaily(on)
    if (on) setWeekly(false)
  }

  function handleWeekly(on: boolean) {
    setWeekly(on)
    if (on) setDaily(false)
  }

  async function handleSave() {
    if (saving) return
    setSaveError(null)

    if (!locationId) {
      setSaveError(t.setLoadError)
      return
    }

    const frequency: 'daily' | 'weekly' | undefined =
      daily ? 'daily' : weekly ? 'weekly' : undefined
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

    // Drop incomplete rows before persisting — same pre-filter as
    // onboarding handleStep2Continue. Server validator rejects any row
    // missing label / value / when_to_use; pre-filtering means a partly
    // typed channel doesn't 400 the whole save.
    const cleanChannels = contactChannels.filter(
      (c) => c.label.trim() && c.value.trim() && c.when_to_use.trim(),
    )

    setSaving(true)
    try {
      const res = await fetch('/api/settings/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId,
          personality,
          avoid,
          language,
          autoDetectLanguage,
          frequency,
          digestDay: frequency === 'weekly' ? 1 : null, // Monday default; surface a day picker in a follow-up
          digestTime: hourIdxToTime(hourIdx),
          timezone,
          contactChannels: cleanChannels,
        }),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.error(`POST /api/settings/save failed: HTTP ${res.status}`, body)
        setSaveError(t.setLoadError)
        return
      }

      // Snapshot current values as the new saved baseline so isDirty() flips false.
      // The post-save snapshot uses cleanChannels (the body we actually sent)
      // rather than the unfiltered `contactChannels` so an in-progress empty
      // row left behind by the user doesn't immediately mark the form dirty
      // again right after save. Deep-clone so subsequent mutations to state
      // don't drift the baseline.
      savedRef.current = {
        restaurantName, personality, avoid, language, autoDetectLanguage,
        daily, weekly, lowAlert, hourIdx,
        contactChannels: JSON.parse(JSON.stringify(cleanChannels)) as ContactChannel[],
      }
      // Reflect the filtered list in component state so the form drops any
      // half-typed rows on save. Avoids an "unsaved" indicator one tick after
      // success because state and snapshot disagree.
      setContactChannels(cleanChannels)
      setSavedVersion(v => v + 1)

      // Briefly flash "Saved" so the success state is perceptible, then push
      // the user back to the dashboard. The flash is short (1s) since the
      // navigation itself is the primary success signal — dashboard is the
      // home base after every settings interaction.
      setSavedFlash(true)
      setTimeout(() => {
        setSavedFlash(false)
        router.push('/dashboard')
      }, 1000)
    } catch (err) {
      console.error('POST /api/settings/save threw:', err)
      setSaveError(t.dashNetworkError)
    } finally {
      setSaving(false)
    }
  }

  function handleBackClick(e: React.MouseEvent) {
    if (isDirty()) {
      e.preventDefault()
      setShowUnsavedDialog(true)
    }
  }

  async function handleUnsavedSave() {
    setShowUnsavedDialog(false)
    await handleSave()
    router.push('/dashboard')
  }

  function handleUnsavedDiscard() {
    setShowUnsavedDialog(false)
    router.push('/dashboard')
  }

  // Pause/Resume — server-authoritative, no optimistic flip. The label and
  // sub-text in .dangerInfo continue to show the current state during the
  // request; only the button itself shows "..." until the API returns.
  // paused is updated only after a successful response. On error we leave
  // paused untouched (no rollback needed since we never flipped).
  async function handleToggleAutoPost() {
    if (pauseToggling) return
    setPauseToggling(true)
    try {
      const res = await fetch('/api/settings/toggle-auto-post', { method: 'POST' })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.error(`POST /api/settings/toggle-auto-post failed: HTTP ${res.status}`, body)
        return
      }
      const json = (await res.json()) as { autoPostEnabled: boolean }
      setPaused(!json.autoPostEnabled)
    } catch (err) {
      console.error('POST /api/settings/toggle-auto-post threw:', err)
    } finally {
      setPauseToggling(false)
    }
  }

  async function handleCancelSubscription() {
    if (cancelingSubInFlight) return
    if (!locationId) {
      console.error('cancel-subscription aborted: missing locationId')
      return
    }
    setCancelingSubInFlight(true)
    try {
      const res = await fetch('/api/settings/cancel-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.error(`POST /api/settings/cancel-subscription failed: HTTP ${res.status}`, body)
        return
      }
      setSubCanceled(true)
      setShowCancelSub(false)
    } catch (err) {
      console.error('POST /api/settings/cancel-subscription threw:', err)
    } finally {
      setCancelingSubInFlight(false)
    }
  }

  // Disconnect Google Business Profile — deletes oauth_tokens server-side
  // and flips auto_post_enabled to false. UI flips the pill to a muted
  // "Disconnected" badge and hides the disconnect link on success.
  async function handleDisconnectGoogle() {
    if (gbpDisconnecting) return
    setGbpDisconnecting(true)
    try {
      const res = await fetch('/api/settings/disconnect-google', { method: 'POST' })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.error(`POST /api/settings/disconnect-google failed: HTTP ${res.status}`, body)
        return
      }
      setGbpDisconnected(true)
      // Auto-post is also off now — reflect that in the danger zone.
      setPaused(true)
    } catch (err) {
      console.error('POST /api/settings/disconnect-google threw:', err)
    } finally {
      setGbpDisconnecting(false)
    }
  }

  async function handleDeleteAccount() {
    if (deleting) return
    setDeleting(true)
    try {
      const res = await fetch('/api/settings/delete-account', { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.error(`DELETE /api/settings/delete-account failed: HTTP ${res.status}`, body)
        setDeleting(false)
        return
      }
      // Account is gone — go to landing page. Cookie was cleared by the route.
      window.location.href = '/'
    } catch (err) {
      console.error('DELETE /api/settings/delete-account threw:', err)
      setDeleting(false)
    }
  }

  const digestTime = HOURS[hourIdx]

  return (
    <main className={styles.page}>
      {/* Paused banner — always rendered with a fixed-height slot so toggling
          pause doesn't shift the page below. visibility:hidden keeps the slot
          in flow when the banner is inactive. */}
      <div
        className={styles.pausedBannerSlot}
        style={paused ? undefined : { visibility: 'hidden' }}
        role="alert"
        aria-hidden={paused ? undefined : 'true'}
      >
        <div className={styles.pausedBanner}>
          {t.setPausedBanner}
        </div>
      </div>

      {/* Back nav */}
      <nav className={styles.backNav} aria-label="Navigation">
        <a
          href="/dashboard"
          className={styles.backLink}
          aria-label={t.setBackToDashboard}
          onClick={handleBackClick}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {t.setBackToDashboard}
        </a>
      </nav>

      {/* Unsaved changes dialog */}
      {showUnsavedDialog && (
        <div className={styles.dialogOverlay} onClick={() => setShowUnsavedDialog(false)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <p className={styles.dialogText}>{t.setUnsavedDialog}</p>
            <div className={styles.dialogActions}>
              <button className={styles.btnDialogPrimary} onClick={handleUnsavedSave}>{t.setUnsavedSave}</button>
              <button className={styles.btnDialogSecondary} onClick={handleUnsavedDiscard}>{t.setUnsavedDiscard}</button>
            </div>
          </div>
        </div>
      )}

      <h1 className={styles.pageTitle}>{t.setPageTitle}</h1>

      {loading && (
        <div className={styles.settingsLoading} role="status" aria-live="polite">
          <span className={styles.settingsSpinner} aria-hidden="true" />
          <span className={styles.settingsLoadingText}>{t.setLoadingText}</span>
        </div>
      )}

      {!loading && loadError && (
        <p className={styles.loadErrorNotice} role="alert">{loadError}</p>
      )}

      {!loading && (
        <>
      {/* Section 1: Your location */}
      <section className={`${styles.settingsSection} ${styles.firstSection}`} aria-label={t.setSectionLocation} data-i18n-anchor="settings-location">
        <h2 className={styles.sectionLabel}>{t.setSectionLocation}</h2>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="restaurant-name">{t.setRestaurantNameLabel}</label>
          <input
            type="text"
            id="restaurant-name"
            name="restaurant-name"
            value={restaurantName}
            onChange={(e) => setRestaurantName(e.target.value)}
            autoComplete="off"
            className={styles.textInput}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>{t.setGbpLabel}</label>
          <div className={styles.gbpStatus}>
            {gbpDisconnected ? (
              <span className={styles.statusPillDisconnected}>
                {t.setGbpDisconnected}
              </span>
            ) : (
              <span className={styles.statusPill}>
                <span className={styles.statusDot} aria-hidden="true" />
                {t.setGbpConnected}
              </span>
            )}
            {userEmail && <span className={styles.statusEmail}>{userEmail}</span>}
            {!gbpDisconnected && (
              <button
                className={styles.disconnectLink}
                onClick={handleDisconnectGoogle}
                disabled={gbpDisconnecting}
                aria-label={t.setGbpDisconnect}
              >
                {gbpDisconnecting ? t.setGbpDisconnecting : t.setGbpDisconnect}
              </button>
            )}
          </div>
          {gbpDisconnected && (
            <p className={styles.disconnectConfirmation}>
              {t.setGbpDisconnectedNotice1}
              <a href="/api/auth/google" className={styles.reconnectLink}>{t.setGbpReconnect}</a>
              {t.setGbpDisconnectedNotice2}
            </p>
          )}
        </div>
      </section>

      {/* Section 2: Brand voice — fully inline-editable, no modal */}
      <section className={styles.settingsSection} aria-label={t.setSectionVoice} data-i18n-anchor="settings-voice">
        <h2 className={styles.sectionLabel}>{t.setSectionVoice}</h2>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="personality">{t.setPersonalityLabel}</label>
          <input
            type="text"
            id="personality"
            className={styles.textInput}
            value={personality}
            onChange={(e) => setPersonality(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="avoid">{t.setAvoidLabel}</label>
          <input
            type="text"
            id="avoid"
            className={styles.textInput}
            value={avoid}
            onChange={(e) => setAvoid(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="language">{t.setLanguageLabel}</label>
          <select
            id="language"
            className={styles.selectInput}
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="en">{t.languageEnglish}</option>
            <option value="es">{t.languageSpanish}</option>
            <option value="fr">{t.languageFrench}</option>
            <option value="pt">{t.languagePortuguese}</option>
            <option value="it">{t.languageItalian}</option>
            <option value="de">{t.languageGerman}</option>
            <option value="ja">{t.languageJapanese}</option>
            <option value="zh">{t.languageMandarin}</option>
            <option value="ar">{t.languageArabic}</option>
          </select>
        </div>

        {/* Contact channels — owner-allowlisted, max 5. */}
        <div className={styles.field}>
          <label className={styles.fieldLabel}>{t.contactChannelsHeader}</label>
          <p className={styles.fieldHelp}>{t.contactChannelsHeaderHelp}</p>
          <ContactChannelsForm
            channels={contactChannels}
            onChange={setContactChannels}
          />
        </div>

        {/* Per-review auto-detect — same toggle as onboarding step 2. */}
        <div className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <span className={styles.toggleLabel}>{t.onbStep2AutoLangLabel}</span>
            <span className={styles.toggleSub}>{t.onbStep2AutoLangSub}</span>
          </div>
          <Toggle id="toggle-autolang" checked={autoDetectLanguage} onChange={setAutoDetectLanguage} label={t.onbStep2AutoLangAria} />
        </div>
      </section>

      {/* Section 3: Notifications */}
      <section className={styles.settingsSection} aria-label={t.setSectionNotifications} data-i18n-anchor="settings-notifications">
        <h2 className={styles.sectionLabel}>{t.setSectionNotifications}</h2>

        <div className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <span className={styles.toggleLabel}>{t.setDailyDigest}</span>
            <span className={styles.toggleSub}>{t.setDailyDigestSub(digestTime)}</span>
          </div>
          <Toggle id="toggle-daily" checked={daily} onChange={handleDaily} label={t.setDailyDigest} />
        </div>

        <div className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <span className={styles.toggleLabel}>{t.setWeeklyDigest}</span>
            <span className={styles.toggleSub}>{t.setWeeklyDigestSub(digestTime)}</span>
          </div>
          <Toggle id="toggle-weekly" checked={weekly} onChange={handleWeekly} label={t.setWeeklyDigest} />
        </div>

        <div className={`${styles.toggleRow} ${styles.toggleRowLast}`}>
          <div className={styles.toggleInfo}>
            <span className={styles.toggleLabel}>{t.setInstantAlert}</span>
            <span className={styles.toggleSub}>{t.setInstantAlertSub}</span>
          </div>
          <Toggle id="toggle-low" checked={lowAlert} onChange={setLowAlert} label={t.setInstantAlert} />
        </div>

        <div className={styles.timeField}>
          <label id="time-label" className={styles.fieldLabel}>{t.setSendAt}</label>
          <div className={styles.hourPicker} role="group" aria-labelledby="time-label">
            <button
              className={styles.hourBtn}
              aria-label={t.earlierAria}
              onClick={() => setHourIdx(Math.max(0, hourIdx - 1))}
            >
              −
            </button>
            <div className={styles.hourDisplay} aria-live="polite" aria-atomic="true">
              {HOURS[hourIdx]}
            </div>
            <button
              className={styles.hourBtn}
              aria-label={t.laterAria}
              onClick={() => setHourIdx(Math.min(HOURS.length - 1, hourIdx + 1))}
            >
              +
            </button>
          </div>
        </div>
      </section>

      {/* Section 4: Danger zone */}
      <section className={styles.settingsSection} aria-label={t.setSectionDanger} data-i18n-anchor="settings-danger">
        <h2 className={styles.dangerLabel}>{t.setSectionDanger}</h2>

        <div className={styles.dangerRow}>
          <div className={styles.dangerInfo}>
            <span className={styles.dangerActionLabel}>{paused ? t.setResumeAutoPosting : t.setPauseAutoPosting}</span>
            <span className={styles.dangerSub}>
              {paused ? t.setPausedSub : t.setRunningSub}
            </span>
          </div>
          {/* Muted text link — same .cancelSubLink class the other danger-zone
              actions use. handleToggleAutoPost has its own re-entry guard
              (if pauseToggling: return), so we DON'T set the disabled prop —
              .cancelSubLink:disabled would dim the link to 0.55 opacity on
              every press, which read as "darken on press" while the optimistic
              flip was in flight. The "..." text is the only in-flight signal. */}
          <button
            className={styles.cancelSubLink}
            aria-label={paused ? t.setResumeAutoPosting : t.setPauseAutoPosting}
            onClick={handleToggleAutoPost}
          >
            {pauseToggling ? '...' : (paused ? t.setResumeAutoPosting : t.setPauseAutoPosting)}
          </button>
        </div>

        <div className={styles.dangerRow}>
          <div className={styles.dangerInfo}>
            <span className={styles.dangerActionLabel}>{t.setCancelSubscription}</span>
            <span className={styles.dangerSub}>
              {subCanceled ? t.setSubCanceledNotice : t.setSubAccessContinues}
            </span>
          </div>
          {subCanceled ? (
            <span className={styles.canceledBadge} aria-label={t.setSubCanceledBadge}>{t.setSubCanceledBadge}</span>
          ) : (
            <button className={styles.cancelSubLink} onClick={() => setShowCancelSub(true)}>
              {t.setCancelSubscription}
            </button>
          )}
        </div>

        <div className={`${styles.dangerRow} ${styles.dangerRowLast}`}>
          <div className={styles.dangerInfo}>
            <span className={styles.dangerActionLabel}>{t.setDeleteAccount}</span>
            <span className={styles.dangerSub}>{t.setDeleteSub}</span>
          </div>
          <button className={styles.cancelSubLink} onClick={() => setShowDeleteConfirm(true)} aria-label={t.setDeleteAccount}>
            {t.setDeleteAccount}
          </button>
        </div>
      </section>
        </>
      )}

      {/* Save changes button — sticky, only when dirty (or while flashing
          "Saved" so the success state is visible). Hidden during initial
          load since the form sections aren't rendered. */}
      {!loading && (isDirty() || savedFlash || saveError) && (
        <div className={styles.saveWrap}>
          {saveError && <p className={styles.saveError}>{saveError}</p>}
          <button
            className={styles.btnAmber}
            onClick={handleSave}
            disabled={saving || savedFlash}
          >
            {savedFlash ? t.setSaveSuccess : saving ? t.setSaving : t.setSaveChanges}
          </button>
        </div>
      )}

      {/* Cancel subscription dialog. Per spec the "Keep" button is visually
          dominant — pulling someone back from accidental cancellation. */}
      {showCancelSub && (
        <div className={styles.dialogOverlay} onClick={() => setShowCancelSub(false)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <p className={styles.dialogText}>{t.setSubCancelDialog}</p>
            <div className={styles.dialogActions}>
              <button
                className={styles.btnDialogPrimary}
                onClick={() => setShowCancelSub(false)}
              >
                {t.setSubKeep}
              </button>
              <button
                className={styles.btnDialogSecondary}
                onClick={handleCancelSubscription}
                disabled={cancelingSubInFlight}
              >
                {cancelingSubInFlight ? t.setSubCanceling : t.setSubConfirmCancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete account dialog. */}
      {showDeleteConfirm && (
        <div className={styles.dialogOverlay} onClick={() => setShowDeleteConfirm(false)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <p className={styles.dialogText}>{t.setDeleteDialog}</p>
            <div className={styles.dialogActions}>
              <button
                className={styles.btnDialogPrimary}
                onClick={() => setShowDeleteConfirm(false)}
              >
                {t.setDeleteCancel}
              </button>
              <button
                className={styles.btnDanger}
                onClick={handleDeleteAccount}
                disabled={deleting}
              >
                {deleting ? t.setDeleting : t.setDeleteConfirm}
              </button>
            </div>
          </div>
        </div>
      )}
      <Footer />
    </main>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SettingsContent />
    </Suspense>
  )
}
