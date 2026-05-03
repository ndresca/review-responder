import Link from 'next/link'
import { LogoFull } from '@/components/LogoFull'
import { Footer } from '@/components/Footer'
import { ScrollFadeEdges } from '@/components/ScrollFadeEdges'
import { getServerTranslation } from '@/lib/i18n-server'
import styles from './landing.module.css'

// Cookie-driven i18n means the page can never be statically prerendered —
// the language is per-request, not per-build.
export const dynamic = 'force-dynamic'

export default async function LandingPage() {
  const { t } = await getServerTranslation()

  return (
    <main className={`${styles.page} ${styles.fadeIn}`}>
      <ScrollFadeEdges />
      {/* Logo */}
      <header className={styles.logoWrap}>
        <LogoFull className={styles.logoImg} />
      </header>

      {/* Hero */}
      <section className={styles.hero} aria-label="Hero">
        <h1 className={styles.heroHeadline}>{t.landingHeroHeadline}</h1>
        <p className={styles.heroSub}>{t.landingHeroSub}</p>
        <Link href="/onboarding" className={styles.btnCta}>
          {t.landingCtaGetStarted}
        </Link>
        <p className={styles.trustLine}>{t.landingTrustLine}</p>
      </section>

      <div className={styles.sectionDivider} role="separator" />

      {/* How it works */}
      <section className={styles.stepsSection} aria-label="How it works">
        <h2 className={styles.sectionTitle}>{t.landingStepsTitle}</h2>

        <div className={styles.stepItem}>
          <span className={styles.stepNum} aria-hidden="true">1</span>
          <div className={styles.stepBody}>
            <p className={styles.stepLabel}>{t.landingStep1Label}</p>
            <p className={styles.stepDesc}>{t.landingStep1Desc}</p>
          </div>
        </div>

        <div className={styles.stepItem}>
          <span className={styles.stepNum} aria-hidden="true">2</span>
          <div className={styles.stepBody}>
            <p className={styles.stepLabel}>{t.landingStep2Label}</p>
            <p className={styles.stepDesc}>{t.landingStep2Desc}</p>
          </div>
        </div>

        <div className={styles.stepItem}>
          <span className={styles.stepNum} aria-hidden="true">3</span>
          <div className={styles.stepBody}>
            <p className={styles.stepLabel}>{t.landingStep3Label}</p>
            <p className={styles.stepDesc}>{t.landingStep3Desc}</p>
          </div>
        </div>
      </section>

      <div className={styles.sectionDivider} role="separator" />

      {/* Social proof */}
      <section className={styles.testimonials} aria-label="Testimonials">
        <article className={styles.testimonial}>
          <div className={styles.testimonialStars} aria-label="5 stars">★★★★★</div>
          <p className={styles.testimonialQuote}>{t.landingTestimonial1Quote}</p>
          <p className={styles.testimonialSource}>{t.landingTestimonial1Source}</p>
        </article>

        <article className={styles.testimonial}>
          <div className={styles.testimonialStars} aria-label="5 stars">★★★★★</div>
          <p className={styles.testimonialQuote}>{t.landingTestimonial2Quote}</p>
          <p className={styles.testimonialSource}>{t.landingTestimonial2Source}</p>
        </article>

        <article className={styles.testimonial}>
          <div className={styles.testimonialStars} aria-label="5 stars">★★★★★</div>
          <p className={styles.testimonialQuote}>{t.landingTestimonial3Quote}</p>
          <p className={styles.testimonialSource}>{t.landingTestimonial3Source}</p>
        </article>
      </section>

      <div className={styles.sectionDivider} role="separator" />

      {/* Pricing */}
      <section aria-label="Pricing">
        <div className={styles.pricingCard}>
          <p className={styles.pricingAmount}>{t.landingPricingAmount}</p>
          <p className={styles.pricingSub}>{t.landingPricingSub}</p>

          <ul className={styles.pricingFeatures}>
            <li className={styles.pricingFeature}>
              <span className={styles.pricingCheck} aria-hidden="true">&#10003;</span>
              {t.landingPricingFeature1}
            </li>
            <li className={styles.pricingFeature}>
              <span className={styles.pricingCheck} aria-hidden="true">&#10003;</span>
              {t.landingPricingFeature2}
            </li>
            <li className={styles.pricingFeature}>
              <span className={styles.pricingCheck} aria-hidden="true">&#10003;</span>
              {t.landingPricingFeature3}
            </li>
            <li className={styles.pricingFeature}>
              <span className={styles.pricingCheck} aria-hidden="true">&#10003;</span>
              {t.landingPricingFeature4}
            </li>
          </ul>

          <Link href="/onboarding" className={styles.btnCta}>
            {t.landingCtaGetStarted}
          </Link>
        </div>
      </section>

      <Footer />
    </main>
  )
}
