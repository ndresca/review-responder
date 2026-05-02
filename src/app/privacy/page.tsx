import Link from 'next/link'
import { LanguageToggle } from '@/components/LanguageToggle'
import { getServerTranslation } from '@/lib/i18n-server'
import styles from './privacy.module.css'

export const metadata = {
  title: 'Privacy Policy — Autoplier',
}

// Cookie-driven i18n: must run per-request, never prerendered.
export const dynamic = 'force-dynamic'

export default async function PrivacyPage() {
  const { t } = await getServerTranslation()

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.backLink}>
          {t.privBackToLanding}
        </Link>
        <LanguageToggle />
      </header>

      <h1 className={styles.title}>{t.privTitle}</h1>
      <p className={styles.effective}>{t.privEffective}</p>

      <p className={styles.intro}>{t.privIntro}</p>

      <section className={styles.section}>
        <h2 className={styles.heading}>{t.privCollectHeading}</h2>
        <ul className={styles.list}>
          <li>
            <strong>{t.privCollect1Strong}</strong>{t.privCollect1Body}
          </li>
          <li>
            <strong>{t.privCollect2Strong}</strong>{t.privCollect2Body}
          </li>
          <li>
            <strong>{t.privCollect3Strong}</strong>{t.privCollect3Body}
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>{t.privUseHeading}</h2>
        <p className={styles.body}>{t.privUseBody}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>{t.privStorageHeading}</h2>
        <p className={styles.body}>{t.privStorageBody}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>{t.privThirdHeading}</h2>
        <p className={styles.body}>{t.privThirdIntro}</p>
        <ul className={styles.list}>
          <li>
            <strong>{t.privThirdGoogleStrong}</strong>{t.privThirdGoogleBody}
          </li>
          <li>
            <strong>{t.privThirdStripeStrong}</strong>{t.privThirdStripeBody}
          </li>
          <li>
            <strong>{t.privThirdAnthropicStrong}</strong>{t.privThirdAnthropicBody}
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>{t.privRetentionHeading}</h2>
        <p className={styles.body}>{t.privRetentionBody}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>{t.privContactHeading}</h2>
        <p className={styles.body}>
          {t.privContactBefore}
          <a href="mailto:contact@autoplier.com" className={styles.link}>
            contact@autoplier.com
          </a>
          {t.privContactAfter}
        </p>
      </section>

    </main>
  )
}
