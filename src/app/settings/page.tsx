'use client'

import { useState } from 'react'
import Link from 'next/link'
import styles from './settings.module.css'

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
  const [daily, setDaily] = useState(true)
  const [weekly, setWeekly] = useState(false)
  const [lowAlert, setLowAlert] = useState(false)
  const [paused, setPaused] = useState(false)

  function handleDaily(on: boolean) {
    setDaily(on)
    if (on) setWeekly(false)
  }

  function handleWeekly(on: boolean) {
    setWeekly(on)
    if (on) setDaily(false)
  }

  return (
    <main className={styles.page} role="main">
      {/* Back nav */}
      <nav className={styles.backNav} aria-label="Navigation">
        <Link href="/dashboard" className={styles.backLink} aria-label="Back to Dashboard">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Dashboard
        </Link>
      </nav>

      <h1 className={styles.pageTitle}>Settings</h1>

      {/* Section 1: Your location */}
      <section className={`${styles.settingsSection} ${styles.firstSection}`} aria-label="Your location">
        <h2 className={styles.sectionLabel}>Your location</h2>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="restaurant-name">Restaurant name</label>
          <input type="text" id="restaurant-name" name="restaurant-name" defaultValue="Cafe Luna" autoComplete="off" className={styles.textInput} />
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

        <div className={styles.voicePreview}>
          <p className={styles.voiceText}>
            We&apos;re a neighbourhood Italian spot that&apos;s been here since 2012. Regulars call us by name.
            We&apos;re warm but not cheesy, local but not provincial. We never say &ldquo;we apologise for any
            inconvenience&rdquo; because that&apos;s not how real people talk. We say thanks like we mean it
            and own mistakes without corporate speak.
          </p>
          <a href="#" className={styles.voiceEditInline} aria-label="Edit brand voice description">Edit</a>
        </div>

        <div className={styles.voiceChips}>
          <span className={styles.voiceChip}>
            <span className={styles.voiceChipLabel}>Personality</span>
            warm, local, slightly cheeky
          </span>
          <span className={styles.voiceChip}>
            <span className={styles.voiceChipLabel}>Avoid</span>
            &ldquo;We apologise for any inconvenience&rdquo;
          </span>
          <span className={styles.voiceChip}>
            <span className={styles.voiceChipLabel}>Language</span>
            English
          </span>
        </div>

        <button className={styles.btnOutline} aria-label="Edit brand voice settings">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Edit brand voice
        </button>
      </section>

      {/* Section 3: Notifications */}
      <section className={styles.settingsSection} aria-label="Notifications">
        <h2 className={styles.sectionLabel}>Notifications</h2>

        <div className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <span className={styles.toggleLabel}>Daily digest</span>
            <span className={styles.toggleSub}>Sent every morning at 8:00 AM</span>
          </div>
          <Toggle id="toggle-daily" checked={daily} onChange={handleDaily} label="Daily digest" />
        </div>

        <div className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <span className={styles.toggleLabel}>Weekly digest</span>
            <span className={styles.toggleSub}>Sent every Monday morning</span>
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
      </section>

      {/* Section 4: Danger zone */}
      <section className={styles.settingsSection} aria-label="Danger zone">
        <h2 className={styles.dangerLabel}>Danger zone</h2>

        <div className={styles.dangerRow}>
          <div className={styles.dangerInfo}>
            <span className={styles.dangerActionLabel}>Pause auto-posting</span>
            <span className={styles.dangerSub}>Responses will stop until you resume.</span>
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

        <div className={`${styles.dangerRow} ${styles.dangerRowLast}`}>
          <div className={styles.dangerInfo}>
            <span className={styles.dangerActionLabel}>Delete account</span>
            <span className={styles.dangerSub}>This permanently removes your account and all data.</span>
          </div>
          <button className={styles.deleteLink} aria-label="Delete account">Delete account</button>
        </div>
      </section>
    </main>
  )
}
