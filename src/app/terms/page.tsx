import Link from 'next/link'
import { Footer } from '@/components/Footer'
import { getServerTranslation } from '@/lib/i18n-server'
import styles from '../privacy/privacy.module.css'

export const metadata = {
  title: 'Terms of Service — Autoplier',
}

// Cookie-driven i18n: must run per-request, never prerendered.
export const dynamic = 'force-dynamic'

export default async function TermsPage() {
  const { t } = await getServerTranslation()

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.backLink}>
          {t.termsBackToLanding}
        </Link>
      </header>

      <h1 className={styles.title}>{t.termsTitle}</h1>
      <p className={styles.effective}>{t.termsEffective}</p>

      <p className={styles.intro}>{t.termsIntro}</p>

      <section className={styles.section}>
        <h2 className={styles.heading}>{t.termsAcceptHeading}</h2>
        <p className={styles.body}>{t.termsAcceptBody}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>{t.termsServiceHeading}</h2>
        <p className={styles.body}>{t.termsServiceBody}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>{t.termsBillingHeading}</h2>
        <p className={styles.body}>{t.termsBillingBody}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>{t.termsUseHeading}</h2>
        <p className={styles.body}>{t.termsUseBody}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>{t.termsAiHeading}</h2>
        <p className={styles.body}>{t.termsAiBody}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>{t.termsDataHeading}</h2>
        <p className={styles.body}>
          {t.termsDataBefore}
          <Link href="/privacy" className={styles.link}>
            {t.landingFooterPrivacy}
          </Link>
          {t.termsDataAfter}
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>{t.termsLiabilityHeading}</h2>
        <p className={styles.body}>{t.termsLiabilityBody}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>{t.termsTerminationHeading}</h2>
        <p className={styles.body}>{t.termsTerminationBody}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>{t.termsChangesHeading}</h2>
        <p className={styles.body}>{t.termsChangesBody}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>{t.termsLawHeading}</h2>
        <p className={styles.body}>{t.termsLawBody}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>{t.termsContactHeading}</h2>
        <p className={styles.body}>
          {t.termsContactBefore}
          <a href="mailto:contact@landofiguanas.com" className={styles.link}>
            contact@landofiguanas.com
          </a>
          {t.termsContactAfter}
        </p>
      </section>

      <Footer />
    </main>
  )
}
