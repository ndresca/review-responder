'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import styles from './settings.module.css'

const HOURS = [
  '6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM',
  '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM',
  '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM',
]

const INITIAL = {
  restaurantName: 'Cafe Luna',
  brandVoice: 'We\'re a neighbourhood Italian spot that\'s been here since 2012. Regulars call us by name. We\'re warm but not cheesy, local but not provincial. We never say "we apologise for any inconvenience" because that\'s not how real people talk. We say thanks like we mean it and own mistakes without corporate speak.',
  personality: 'warm, local, slightly cheeky',
  avoid: 'We apologise for any inconvenience',
  language: 'en',
  daily: true,
  weekly: false,
  lowAlert: false,
  hourIdx: 2,
}

function Toggle({
  id,
  checked,
  onChange,
  label,
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

export default function SettingsPage() {
  const router = useRouter()

  // Form state
  const [restaurantName, setRestaurantName] = useState(INITIAL.restaurantName)
  const [brandVoice, setBrandVoice] = useState(INITIAL.brandVoice)
  const [personality, setPersonality] = useState(INITIAL.personality)
  const [avoid, setAvoid] = useState(INITIAL.avoid)
  const [language, setLanguage] = useState(INITIAL.language)
  const [daily, setDaily] = useState(INITIAL.daily)
  const [weekly, setWeekly] = useState(INITIAL.weekly)
  const [lowAlert, setLowAlert] = useState(INITIAL.lowAlert)
  const [hourIdx, setHourIdx] = useState(INITIAL.hourIdx)

  // UI state
  const [paused, setPaused] = useState(false)
  const [editingVoice, setEditingVoice] = useState(false)
  const [editVoice, setEditVoice] = useState(brandVoice)
  const [editPersonality, setEditPersonality] = useState(personality)
  const [editAvoid, setEditAvoid] = useState(avoid)
  const [editLanguage, setEditLanguage] = useState(language)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showCancelSub, setShowCancelSub] = useState(false)
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)

  // Saved snapshot for dirty checking
  const savedRef = useRef({ ...INITIAL })

  const isDirty = useCallback(() => {
    const s = savedRef.current
    return (
      restaurantName !== s.restaurantName ||
      brandVoice !== s.brandVoice ||
      personality !== s.personality ||
      avoid !== s.avoid ||
      language !== s.language ||
      daily !== s.daily ||
      weekly !== s.weekly ||
      lowAlert !== s.lowAlert ||
      hourIdx !== s.hourIdx
    )
  }, [restaurantName, brandVoice, personality, avoid, language, daily, weekly, lowAlert, hourIdx])

  function handleDaily(on: boolean) {
    setDaily(on)
    if (on) setWeekly(false)
  }

  function handleWeekly(on: boolean) {
    setWeekly(on)
    if (on) setDaily(false)
  }

  function handleSave() {
    savedRef.current = {
      restaurantName, brandVoice, personality, avoid, language,
      daily, weekly, lowAlert, hourIdx,
    }
    // Force re-render to hide save button
    setRestaurantName(restaurantName)
  }

  function handleBackClick(e: React.MouseEvent) {
    if (isDirty()) {
      e.preventDefault()
      setShowUnsavedDialog(true)
    }
  }

  function handleUnsavedSave() {
    handleSave()
    setShowUnsavedDialog(false)
    router.push('/dashboard')
  }

  function handleUnsavedDiscard() {
    setShowUnsavedDialog(false)
    router.push('/dashboard')
  }

  function startEditVoice() {
    setEditVoice(brandVoice)
    setEditPersonality(personality)
    setEditAvoid(avoid)
    setEditLanguage(language)
    setEditingVoice(true)
  }

  function saveVoiceEdit() {
    setBrandVoice(editVoice)
    setPersonality(editPersonality)
    setAvoid(editAvoid)
    setLanguage(editLanguage)
    setEditingVoice(false)
  }

  function cancelVoiceEdit() {
    setEditingVoice(false)
  }

  const digestTime = HOURS[hourIdx]

  return (
    <main className={styles.page}>
      {/* Paused banner */}
      {paused && (
        <div className={styles.pausedBanner} role="alert">
          Auto-posting is paused. Reviews are not being responded to.
        </div>
      )}

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
              <button className={styles.btnAmber} onClick={handleUnsavedSave}>Save</button>
              <button className={styles.btnDialogMuted} onClick={handleUnsavedDiscard}>Discard</button>
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

      {/* Section 2: Brand voice */}
      <section className={styles.settingsSection} aria-label="Brand voice">
        <h2 className={styles.sectionLabel}>Brand voice</h2>

        {!editingVoice ? (
          <>
            <div className={styles.voicePreview}>
              <p className={styles.voiceText}>{brandVoice}</p>
              <button className={styles.voiceEditInline} onClick={startEditVoice} aria-label="Edit brand voice description">
                Edit
              </button>
            </div>

            <div className={styles.voiceChips}>
              <span className={styles.voiceChip}>
                <span className={styles.voiceChipLabel}>Personality</span>
                {personality || 'Not set'}
              </span>
              <span className={styles.voiceChip}>
                <span className={styles.voiceChipLabel}>Avoid</span>
                {avoid ? `"${avoid}"` : 'Not set'}
              </span>
              <span className={styles.voiceChip}>
                <span className={styles.voiceChipLabel}>Language</span>
                {language === 'en' ? 'English' : language === 'es' ? 'Spanish' : language === 'fr' ? 'French' : language === 'it' ? 'Italian' : language === 'de' ? 'German' : language === 'pt' ? 'Portuguese' : language === 'ja' ? 'Japanese' : language === 'zh' ? 'Mandarin' : language === 'ar' ? 'Arabic' : language}
              </span>
            </div>

            <button className={styles.btnOutline} onClick={startEditVoice} aria-label="Edit brand voice settings">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit brand voice
            </button>
          </>
        ) : (
          <div className={styles.voiceEditForm}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="edit-voice">Your brand voice</label>
              <textarea
                id="edit-voice"
                rows={5}
                className={styles.textarea}
                value={editVoice}
                onChange={(e) => setEditVoice(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="edit-personality">Personality</label>
              <input
                type="text"
                id="edit-personality"
                className={styles.textInput}
                value={editPersonality}
                onChange={(e) => setEditPersonality(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="edit-avoid">Phrases to avoid</label>
              <input
                type="text"
                id="edit-avoid"
                className={styles.textInput}
                value={editAvoid}
                onChange={(e) => setEditAvoid(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="edit-language">Primary language</label>
              <select
                id="edit-language"
                className={styles.selectInput}
                value={editLanguage}
                onChange={(e) => setEditLanguage(e.target.value)}
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
            <div className={styles.voiceEditActions}>
              <button className={styles.btnAmberSmall} onClick={saveVoiceEdit}>Save</button>
              <button className={styles.btnDialogMuted} onClick={cancelVoiceEdit}>Cancel</button>
            </div>
          </div>
        )}
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
            <span className={styles.dangerSub}>Your access continues until the end of your billing period.</span>
          </div>
          <button className={styles.cancelSubLink} onClick={() => setShowCancelSub(true)}>
            Cancel subscription
          </button>
        </div>

        <div className={`${styles.dangerRow} ${styles.dangerRowLast}`}>
          <div className={styles.dangerInfo}>
            <span className={styles.dangerActionLabel}>Delete account</span>
            <span className={styles.dangerSub}>This permanently removes your account and all data.</span>
          </div>
          <button className={styles.deleteLink} onClick={() => setShowDeleteConfirm(true)} aria-label="Delete account">
            Delete account
          </button>
        </div>
      </section>

      {/* Save changes button — only when dirty */}
      {isDirty() && (
        <div className={styles.saveWrap}>
          <button className={styles.btnAmber} onClick={handleSave}>
            Save changes
          </button>
        </div>
      )}

      {/* Cancel subscription dialog */}
      {showCancelSub && (
        <div className={styles.dialogOverlay} onClick={() => setShowCancelSub(false)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <p className={styles.dialogText}>
              Your subscription will end at the close of your current billing period.
            </p>
            <div className={styles.dialogActions}>
              <button className={styles.btnMutedOutline} onClick={() => setShowCancelSub(false)}>
                Confirm cancellation
              </button>
              <button className={styles.btnAmberSmall} onClick={() => setShowCancelSub(false)}>
                Keep subscription
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete account dialog */}
      {showDeleteConfirm && (
        <div className={styles.dialogOverlay} onClick={() => setShowDeleteConfirm(false)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <p className={styles.dialogText}>
              This will permanently delete your account and all data. This cannot be undone.
            </p>
            <div className={styles.dialogActions}>
              <button className={styles.btnDanger} onClick={() => setShowDeleteConfirm(false)}>
                Delete my account
              </button>
              <button className={styles.btnDialogMuted} onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
