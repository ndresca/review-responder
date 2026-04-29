'use client'

import { useState, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import styles from './settings.module.css'

const HOURS = [
  '6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM',
  '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM',
  '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM',
]

// Hour string → 0–23 index for digest_time. The mock seed uses index 2 = 8am.
function hourIdxToTime(idx: number): number {
  // HOURS starts at 6am, so index 0 = 6, index 1 = 7, etc.
  return 6 + idx
}

// TODO(load-endpoint): the page currently seeds from this hardcoded mock.
// Once GET /api/settings/load is wired, replace INITIAL with whatever the
// endpoint returns for the user's first location. handleSave will then
// update real DB rows; right now it overwrites them with this mock if the
// user clicks save without editing.
const INITIAL = {
  restaurantName: 'Cafe Luna',
  personality: 'warm, local, slightly cheeky',
  avoid: 'We apologise for any inconvenience',
  signaturePhrasesText: 'see you soon!, come back and see us',
  language: 'en',
  daily: true,
  weekly: false,
  lowAlert: false,
  hourIdx: 2,
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
  const locationId = searchParams.get('locationId')

  // Form state — all editable inline, all dirty-tracked.
  const [restaurantName, setRestaurantName] = useState(INITIAL.restaurantName)
  const [personality, setPersonality] = useState(INITIAL.personality)
  const [avoid, setAvoid] = useState(INITIAL.avoid)
  const [signaturePhrasesText, setSignaturePhrasesText] = useState(INITIAL.signaturePhrasesText)
  const [language, setLanguage] = useState(INITIAL.language)
  const [daily, setDaily] = useState(INITIAL.daily)
  const [weekly, setWeekly] = useState(INITIAL.weekly)
  const [lowAlert, setLowAlert] = useState(INITIAL.lowAlert)
  const [hourIdx, setHourIdx] = useState(INITIAL.hourIdx)

  // UI state
  const [paused, setPaused] = useState(false)
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

  // Saved snapshot for dirty checking. Bumping savedVersion forces re-render
  // after save without the previous setRestaurantName(restaurantName) hack.
  const savedRef = useRef({ ...INITIAL })
  const [, setSavedVersion] = useState(0)

  const isDirty = useCallback(() => {
    const s = savedRef.current
    return (
      restaurantName !== s.restaurantName ||
      personality !== s.personality ||
      avoid !== s.avoid ||
      signaturePhrasesText !== s.signaturePhrasesText ||
      language !== s.language ||
      daily !== s.daily ||
      weekly !== s.weekly ||
      lowAlert !== s.lowAlert ||
      hourIdx !== s.hourIdx
    )
  }, [restaurantName, personality, avoid, signaturePhrasesText, language, daily, weekly, lowAlert, hourIdx])

  function handleDaily(on: boolean) {
    setDaily(on)
    if (on) setWeekly(false)
  }

  function handleWeekly(on: boolean) {
    setWeekly(on)
    if (on) setDaily(false)
  }

  // Parses the comma-separated phrases input into a clean string[] for the API.
  function parseSignaturePhrases(raw: string): string[] {
    return raw.split(',').map(s => s.trim()).filter(Boolean)
  }

  async function handleSave() {
    if (saving) return
    setSaveError(null)

    if (!locationId) {
      setSaveError('Missing location — open settings via the dashboard so we know which restaurant to save.')
      return
    }

    const frequency: 'daily' | 'weekly' | undefined =
      daily ? 'daily' : weekly ? 'weekly' : undefined
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

    setSaving(true)
    try {
      const res = await fetch('/api/settings/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId,
          personality,
          avoid,
          signaturePhrases: parseSignaturePhrases(signaturePhrasesText),
          language,
          frequency,
          digestDay: frequency === 'weekly' ? 1 : null, // Monday default; surface a day picker in a follow-up
          digestTime: hourIdxToTime(hourIdx),
          timezone,
        }),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.error(`POST /api/settings/save failed: HTTP ${res.status}`, body)
        setSaveError(res.status === 401 ? 'Sign in again to save changes.' : 'Couldn\'t save. Try again.')
        return
      }

      // Snapshot current values as the new saved baseline so isDirty() flips false.
      savedRef.current = {
        restaurantName, personality, avoid, signaturePhrasesText, language,
        daily, weekly, lowAlert, hourIdx,
      }
      setSavedVersion(v => v + 1)

      // Briefly flash "Saved" — 2s as specified.
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2000)
    } catch (err) {
      console.error('POST /api/settings/save threw:', err)
      setSaveError('Network error — check your connection and try again.')
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
      {/* Paused banner — always rendered with a fixed-height slot to prevent
          layout shift when toggling pause. Visibility flips, height stays. */}
      <div
        className={styles.pausedBannerSlot}
        style={paused ? undefined : { visibility: 'hidden' }}
        role="alert"
      >
        <div className={styles.pausedBanner}>
          Auto-posting is paused. Reviews are not being responded to.
        </div>
      </div>

      {/* Back nav */}
      <nav className={styles.backNav} aria-label="Navigation">
        <a
          href="/dashboard"
          className={styles.backLink}
          aria-label="Back to Dashboard"
          onClick={handleBackClick}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Dashboard
        </a>
      </nav>

      {/* Unsaved changes dialog */}
      {showUnsavedDialog && (
        <div className={styles.dialogOverlay} onClick={() => setShowUnsavedDialog(false)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <p className={styles.dialogText}>You have unsaved changes. Save before leaving?</p>
            <div className={styles.dialogActions}>
              <button className={styles.btnDialogPrimary} onClick={handleUnsavedSave}>Save</button>
              <button className={styles.btnDialogSecondary} onClick={handleUnsavedDiscard}>Discard</button>
            </div>
          </div>
        </div>
      )}

      <h1 className={styles.pageTitle}>Settings</h1>

      {/* Section 1: Your location */}
      <section className={`${styles.settingsSection} ${styles.firstSection}`} aria-label="Your location">
        <h2 className={styles.sectionLabel}>Your location</h2>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="restaurant-name">Restaurant name</label>
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
          <label className={styles.fieldLabel}>Google Business Profile</label>
          <div className={styles.gbpStatus}>
            <span className={styles.statusPill}>
              <span className={styles.statusDot} aria-hidden="true" />
              Connected
            </span>
            <span className={styles.statusEmail}>owner@cafeluna.com</span>
            <a href="#" className={styles.disconnectLink} aria-label="Disconnect Google Business Profile">Disconnect</a>
          </div>
        </div>
      </section>

      {/* Section 2: Brand voice — fully inline-editable, no modal */}
      <section className={styles.settingsSection} aria-label="Brand voice">
        <h2 className={styles.sectionLabel}>Brand voice</h2>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="personality">Personality</label>
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
          <label className={styles.fieldLabel} htmlFor="avoid">Phrases to avoid</label>
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
          <label className={styles.fieldLabel} htmlFor="signature-phrases">Signature phrases</label>
          <input
            type="text"
            id="signature-phrases"
            className={styles.textInput}
            value={signaturePhrasesText}
            onChange={(e) => setSignaturePhrasesText(e.target.value)}
            autoComplete="off"
            placeholder="comma-separated"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="language">Primary language</label>
          <select
            id="language"
            className={styles.selectInput}
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
      </section>

      {/* Section 3: Notifications */}
      <section className={styles.settingsSection} aria-label="Notifications">
        <h2 className={styles.sectionLabel}>Notifications</h2>

        <div className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <span className={styles.toggleLabel}>Daily digest</span>
            <span className={styles.toggleSub}>Sent every morning at {digestTime}.</span>
          </div>
          <Toggle id="toggle-daily" checked={daily} onChange={handleDaily} label="Daily digest" />
        </div>

        <div className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <span className={styles.toggleLabel}>Weekly digest</span>
            <span className={styles.toggleSub}>Sent every Monday morning at {digestTime}.</span>
          </div>
          <Toggle id="toggle-weekly" checked={weekly} onChange={handleWeekly} label="Weekly digest" />
        </div>

        <div className={`${styles.toggleRow} ${styles.toggleRowLast}`}>
          <div className={styles.toggleInfo}>
            <span className={styles.toggleLabel}>Instant alert for low ratings</span>
            <span className={styles.toggleSub}>Notified immediately for reviews under 3 stars</span>
          </div>
          <Toggle id="toggle-low" checked={lowAlert} onChange={setLowAlert} label="Instant alert for low ratings" />
        </div>

        <div className={styles.timeField}>
          <label id="time-label" className={styles.fieldLabel}>Send at</label>
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
      </section>

      {/* Section 4: Danger zone */}
      <section className={styles.settingsSection} aria-label="Danger zone">
        <h2 className={styles.dangerLabel}>Danger zone</h2>

        <div className={styles.dangerRow}>
          <div className={styles.dangerInfo}>
            <span className={styles.dangerActionLabel}>{paused ? 'Resume auto-posting' : 'Pause auto-posting'}</span>
            <span className={styles.dangerSub}>
              {paused ? 'Auto-posting is currently paused.' : 'Responses will stop until you resume.'}
            </span>
          </div>
          <button
            className={styles.btnMutedOutline}
            aria-label={paused ? 'Resume auto-posting' : 'Pause auto-posting'}
            onClick={() => setPaused(!paused)}
            style={paused ? { color: 'var(--success)', borderColor: 'var(--success)' } : undefined}
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
        </div>

        <div className={styles.dangerRow}>
          <div className={styles.dangerInfo}>
            <span className={styles.dangerActionLabel}>Cancel subscription</span>
            <span className={styles.dangerSub}>
              {subCanceled
                ? 'Your subscription has been canceled. You\'ll retain access until the end of your billing period.'
                : 'Your access continues until the end of your billing period.'}
            </span>
          </div>
          {subCanceled ? (
            <span className={styles.canceledBadge} aria-label="Subscription canceled">Canceled</span>
          ) : (
            <button className={styles.cancelSubLink} onClick={() => setShowCancelSub(true)}>
              Cancel subscription
            </button>
          )}
        </div>

        <div className={`${styles.dangerRow} ${styles.dangerRowLast}`}>
          <div className={styles.dangerInfo}>
            <span className={styles.dangerActionLabel}>Delete account</span>
            <span className={styles.dangerSub}>This permanently removes your account and all data.</span>
          </div>
          {/* Visually de-emphasised — the delete affordance shouldn't be more
              prominent than cancel-subscription. The actual destructive
              action lives behind the confirmation dialog (.btnDanger). */}
          <button className={styles.cancelSubLink} onClick={() => setShowDeleteConfirm(true)} aria-label="Delete account">
            Delete account
          </button>
        </div>
      </section>

      {/* Save changes button — sticky, only when dirty (or while flashing
          "Saved" so the success state is visible). */}
      {(isDirty() || savedFlash || saveError) && (
        <div className={styles.saveWrap}>
          {saveError && <p className={styles.saveError}>{saveError}</p>}
          <button
            className={styles.btnAmber}
            onClick={handleSave}
            disabled={saving || savedFlash}
          >
            {savedFlash ? 'Saved ✓' : saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      )}

      {/* Cancel subscription dialog. Per spec the "Keep" button is visually
          dominant — pulling someone back from accidental cancellation. */}
      {showCancelSub && (
        <div className={styles.dialogOverlay} onClick={() => setShowCancelSub(false)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <p className={styles.dialogText}>
              Your subscription will be canceled. You&apos;ll retain access until the end of your billing period.
            </p>
            <div className={styles.dialogActions}>
              <button
                className={styles.btnDialogPrimary}
                onClick={() => setShowCancelSub(false)}
              >
                Keep subscription
              </button>
              <button
                className={styles.btnDialogSecondary}
                onClick={handleCancelSubscription}
                disabled={cancelingSubInFlight}
              >
                {cancelingSubInFlight ? 'Canceling...' : 'Confirm cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete account dialog. Destructive confirm uses .btnDanger; the
          dismiss button is visually dominant per spec. */}
      {showDeleteConfirm && (
        <div className={styles.dialogOverlay} onClick={() => setShowDeleteConfirm(false)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <p className={styles.dialogText}>
              This will permanently delete your account and all data. This cannot be undone.
            </p>
            <div className={styles.dialogActions}>
              <button
                className={styles.btnDialogPrimary}
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </button>
              <button
                className={styles.btnDanger}
                onClick={handleDeleteAccount}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete my account'}
              </button>
            </div>
          </div>
        </div>
      )}
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
