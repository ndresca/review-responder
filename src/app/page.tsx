import Link from 'next/link'
import { LogoFull } from '@/components/LogoFull'
import styles from './landing.module.css'

export default function LandingPage() {
  return (
    <main className={styles.page}>
      {/* Logo */}
      <header className={styles.logoWrap}>
        <LogoFull className={styles.logoImg} />
      </header>

      {/* Hero */}
      <section className={styles.hero} aria-label="Hero">
        <h1 className={styles.heroHeadline}>Your Google reviews, handled.</h1>
        <p className={styles.heroSub}>
          Autoplier reads every new review and posts a response in your voice,
          automatically. No approval needed.
        </p>
        <Link href="/onboarding" className={styles.btnCta}>
          Get started free
        </Link>
        <p className={styles.trustLine}>14-day free trial. Cancel anytime.</p>
      </section>

      <div className={styles.sectionDivider} role="separator" />

      {/* How it works */}
      <section className={styles.stepsSection} aria-label="How it works">
        <h2 className={styles.sectionTitle}>Set it up once. It runs forever.</h2>

        <div className={styles.stepItem}>
          <span className={styles.stepNum} aria-hidden="true">1</span>
          <div className={styles.stepBody}>
            <p className={styles.stepLabel}>Connect your Google Business Profile</p>
            <p className={styles.stepDesc}>One OAuth tap, takes 30 seconds.</p>
          </div>
        </div>

        <div className={styles.stepItem}>
          <span className={styles.stepNum} aria-hidden="true">2</span>
          <div className={styles.stepBody}>
            <p className={styles.stepLabel}>Describe your restaurant&apos;s voice</p>
            <p className={styles.stepDesc}>
              Tell us how you talk to customers. The AI calibrates to match.
            </p>
          </div>
        </div>

        <div className={styles.stepItem}>
          <span className={styles.stepNum} aria-hidden="true">3</span>
          <div className={styles.stepBody}>
            <p className={styles.stepLabel}>Go live</p>
            <p className={styles.stepDesc}>
              Every new review gets a response within 15 minutes, automatically posted.
            </p>
          </div>
        </div>
      </section>

      <div className={styles.sectionDivider} role="separator" />

      {/* Social proof */}
      <section className={styles.testimonials} aria-label="Testimonials">
        <article className={styles.testimonial}>
          <div className={styles.testimonialStars} aria-label="5 stars">★★★★★</div>
          <p className={styles.testimonialQuote}>
            &ldquo;We used to spend an hour every morning on reviews. Now it just happens.
            The responses sound exactly like us.&rdquo;
          </p>
          <p className={styles.testimonialSource}>Naomi&apos;s, Miami</p>
        </article>

        <article className={styles.testimonial}>
          <div className={styles.testimonialStars} aria-label="5 stars">★★★★★</div>
          <p className={styles.testimonialQuote}>
            &ldquo;Even our regulars can&apos;t tell it&apos;s AI. It picked up on the way we
            say &lsquo;cheers&rsquo; instead of &lsquo;thank you&rsquo; after two examples.&rdquo;
          </p>
          <p className={styles.testimonialSource}>Bocado Tapas, Worcester</p>
        </article>

        <article className={styles.testimonial}>
          <div className={styles.testimonialStars} aria-label="5 stars">★★★★★</div>
          <p className={styles.testimonialQuote}>
            &ldquo;Set it up on a Tuesday, forgot about it by Thursday. That&apos;s the whole point.&rdquo;
          </p>
          <p className={styles.testimonialSource}>Pink&apos;s, Madrid</p>
        </article>
      </section>

      <div className={styles.sectionDivider} role="separator" />

      {/* Pricing */}
      <section aria-label="Pricing">
        <div className={styles.pricingCard}>
          <p className={styles.pricingAmount}>$29/month — unlimited locations</p>
          <p className={styles.pricingSub}>14-day free trial, no credit card required.</p>

          <ul className={styles.pricingFeatures}>
            <li className={styles.pricingFeature}>
              <span className={styles.pricingCheck} aria-hidden="true">&#10003;</span>
              Automatic responses to every Google review
            </li>
            <li className={styles.pricingFeature}>
              <span className={styles.pricingCheck} aria-hidden="true">&#10003;</span>
              Calibrated to your brand voice
            </li>
            <li className={styles.pricingFeature}>
              <span className={styles.pricingCheck} aria-hidden="true">&#10003;</span>
              Daily or weekly digest email
            </li>
            <li className={styles.pricingFeature}>
              <span className={styles.pricingCheck} aria-hidden="true">&#10003;</span>
              Instant alerts for low-rated reviews
            </li>
          </ul>

          <Link href="/onboarding" className={styles.btnCta}>
            Get started free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.siteFooter}>
        Autoplier · <a href="mailto:contact@autoplier.com">contact@autoplier.com</a> · <Link href="/privacy">Privacy</Link>
      </footer>
    </main>
  )
}
