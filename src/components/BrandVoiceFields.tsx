'use client'

import { useTranslation } from '@/lib/i18n-client'
import styles from './BrandVoiceFields.module.css'

const OWNER_DESCRIPTION_MAX = 2000
const PERSONALITY_MAX = 1000
const AVOID_MAX = 500

// Two render modes:
//   'onboarding' — owner-description and language show a Required badge;
//                  personality, avoid, and the auto-detect toggle show an
//                  Optional badge. Used by onboarding step 2 where these
//                  decorations communicate which fields gate progress.
//   'flat'       — no Required/Optional badges. Used by the settings page
//                  and the calibration step 3 "Edit brand voice" panel,
//                  where the same fields are pure inline editors.
type Mode = 'onboarding' | 'flat'

type Props = {
  mode: Mode
  ownerDescription: string
  onOwnerDescriptionChange: (next: string) => void
  personality: string
  onPersonalityChange: (next: string) => void
  avoid: string
  onAvoidChange: (next: string) => void
  language: string
  onLanguageChange: (next: string) => void
  autoLang: boolean
  onAutoLangChange: (next: boolean) => void
  // Per-field error message. Onboarding step 2 passes a string when its
  // step-validation runs against an empty owner description; settings and
  // the panel never pass errors. Component renders the error inline below
  // the relevant field.
  errors?: { ownerDescription?: string }
  // Optional id-prefix override so multiple instances on the same page
  // (e.g. onboarding's step 2 inline use + a panel use somewhere else)
  // don't collide on input ids. Default 'bvf'.
  idPrefix?: string
}

// BrandVoiceFields — the four-or-five-field brand voice form, extracted
// so onboarding step 2, settings, and the calibration step 3 panel all
// render the same controls. Pure presentational: parent owns state.
//
// Field order is fixed across both modes so the visual flow is consistent
// regardless of where the component is rendered:
//   1. ownerDescription (multi-line)
//   2. personality (single-line)
//   3. avoid (single-line)
//   4. language (select)
//   5. autoLang (toggle)
//
// Contact channels live OUTSIDE this component — they're rendered by the
// parent at each call site (onboarding inlines after the file upload,
// settings inlines after this component, the panel renders them inside
// a nested collapsible). Keeping channels external lets each surface
// decide its own contact-channel framing without forking this component.
export function BrandVoiceFields({
  mode,
  ownerDescription,
  onOwnerDescriptionChange,
  personality,
  onPersonalityChange,
  avoid,
  onAvoidChange,
  language,
  onLanguageChange,
  autoLang,
  onAutoLangChange,
  errors,
  idPrefix = 'bvf',
}: Props) {
  const { t } = useTranslation()
  const isOnboarding = mode === 'onboarding'
  const requiredBadge = (
    <span className={styles.required}>{t.onbStep2FieldRequired}</span>
  )
  const optionalBadge = (
    <span className={styles.optional}>{t.onbStep2FieldOptional}</span>
  )

  const ownerDescErrId = `${idPrefix}-owner-description-error`

  return (
    <div className={styles.fields}>
      {/* 1. Owner description (multi-line, required in onboarding) */}
      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${idPrefix}-owner-description`}>
          {t.onbStep2VoiceLabel}
          {' '}
          {isOnboarding && requiredBadge}
        </label>
        <textarea
          id={`${idPrefix}-owner-description`}
          rows={5}
          placeholder={t.onbStep2VoicePlaceholder}
          autoComplete="off"
          spellCheck
          maxLength={OWNER_DESCRIPTION_MAX}
          className={`${styles.textarea} ${errors?.ownerDescription ? styles.inputError : ''}`}
          value={ownerDescription}
          onChange={(e) => onOwnerDescriptionChange(e.target.value)}
          aria-invalid={!!errors?.ownerDescription || undefined}
          aria-describedby={errors?.ownerDescription ? ownerDescErrId : undefined}
        />
        {errors?.ownerDescription && (
          <p id={ownerDescErrId} className={styles.fieldError}>
            {errors.ownerDescription}
          </p>
        )}
      </div>

      {/* 2. Personality (single-line, optional) */}
      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${idPrefix}-personality`}>
          {t.onbStep2PersonalityLabel}
          {' '}
          {isOnboarding && optionalBadge}
        </label>
        <input
          id={`${idPrefix}-personality`}
          type="text"
          placeholder={t.onbStep2PersonalityPlaceholder}
          autoComplete="off"
          maxLength={PERSONALITY_MAX}
          className={styles.input}
          value={personality}
          onChange={(e) => onPersonalityChange(e.target.value)}
        />
      </div>

      {/* 3. Avoid (single-line, optional) */}
      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${idPrefix}-avoid`}>
          {t.onbStep2AvoidLabel}
          {' '}
          {isOnboarding && optionalBadge}
        </label>
        <input
          id={`${idPrefix}-avoid`}
          type="text"
          placeholder={t.onbStep2AvoidPlaceholder}
          autoComplete="off"
          maxLength={AVOID_MAX}
          className={styles.input}
          value={avoid}
          onChange={(e) => onAvoidChange(e.target.value)}
        />
      </div>

      {/* 4. Language (select, required in onboarding) */}
      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${idPrefix}-language`}>
          {t.onbStep2LanguageLabel}
          {' '}
          {isOnboarding && requiredBadge}
        </label>
        <select
          id={`${idPrefix}-language`}
          className={styles.select}
          value={language}
          onChange={(e) => onLanguageChange(e.target.value)}
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

      {/* 5. Auto-detect language (toggle, optional) */}
      <div className={styles.toggleRow}>
        <div className={styles.toggleInfo}>
          <span className={styles.label}>
            {t.onbStep2AutoLangLabel}
            {' '}
            {isOnboarding && optionalBadge}
          </span>
          <span className={styles.toggleSub}>{t.onbStep2AutoLangSub}</span>
        </div>
        <button
          type="button"
          className={styles.toggle}
          role="switch"
          aria-checked={autoLang}
          aria-label={t.onbStep2AutoLangAria}
          onClick={() => onAutoLangChange(!autoLang)}
        >
          <span className={styles.toggleTrack}>
            <span className={styles.toggleThumb} />
          </span>
        </button>
      </div>
    </div>
  )
}
