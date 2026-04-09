import Link from 'next/link'
import styles from './privacy.module.css'

export const metadata = {
  title: 'Privacy Policy — Autoplier',
}

export default function PrivacyPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.backLink}>
          ← Back
        </Link>
      </header>

      <h1 className={styles.title}>Privacy Policy</h1>
      <p className={styles.effective}>Effective April 2026</p>

      <p className={styles.intro}>
        Autoplier is an AI-powered tool that responds to Google reviews on behalf
        of restaurant owners. This policy explains what data we collect, how we
        use it, and who we share it with. No legalese — just plain English.
      </p>

      <section className={styles.section}>
        <h2 className={styles.heading}>What we collect</h2>
        <ul className={styles.list}>
          <li>
            <strong>Google account info</strong> — your name, email address, and
            profile picture, provided when you sign in with Google.
          </li>
          <li>
            <strong>Google Business Profile data</strong> — your business
            locations and the reviews posted to them. This is how we know which
            reviews to respond to.
          </li>
          <li>
            <strong>Usage data</strong> — basic analytics like page views and
            feature usage, so we can improve the product. No third-party tracking
            scripts.
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>How we use it</h2>
        <p className={styles.body}>
          We use your data for one thing: generating and posting AI responses to
          your Google reviews, in your voice. Your brand voice settings and
          calibration examples train the AI to match how you actually talk to
          customers. We don&apos;t use your data to train AI models, sell to
          advertisers, or anything else.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Data storage</h2>
        <p className={styles.body}>
          Your data is stored securely in Supabase (hosted on AWS). OAuth tokens
          that grant access to your Google account are encrypted at rest using
          AES-256-GCM. The encryption key is stored separately from the database
          and is never exposed to client-side code.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Third parties</h2>
        <p className={styles.body}>We share data with these services, and only these services:</p>
        <ul className={styles.list}>
          <li>
            <strong>Google</strong> — OAuth authentication and Google Business
            Profile API (to read reviews and post responses).
          </li>
          <li>
            <strong>Stripe</strong> — payment processing. We never see or store
            your full card number.
          </li>
          <li>
            <strong>Anthropic</strong> — AI response generation. Review text and
            your brand voice settings are sent to generate responses. Anthropic
            does not use this data for model training.
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Data retention</h2>
        <p className={styles.body}>
          Your data is retained while your account is active. If you cancel your
          subscription, your data stays available for 30 days in case you change
          your mind. After that, or upon request, we permanently delete
          everything — account info, reviews, responses, OAuth tokens, all of it.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Contact</h2>
        <p className={styles.body}>
          Questions about your data? Email us at{' '}
          <a href="mailto:contact@autoplier.com" className={styles.link}>
            contact@autoplier.com
          </a>
          . We&apos;ll respond within 48 hours.
        </p>
      </section>

      <footer className={styles.footer}>
        <Link href="/" className={styles.footerLink}>
          ← Back to Autoplier
        </Link>
      </footer>
    </main>
  )
}
