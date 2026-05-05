'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n-client'
import type { ContactChannel } from '@/lib/types'
import styles from './ContactChannelsForm.module.css'

const DEFAULT_MAX_CHANNELS = 5
const LABEL_MAX = 100
const VALUE_MAX = 200
const WHEN_TO_USE_MAX = 500

type Props = {
  channels: ContactChannel[]
  onChange: (next: ContactChannel[]) => void
  maxChannels?: number
}

// Internal state shape — never exposed to the host. Each slot tracks
// whether the row is being edited (DRAFT) or committed (SAVED). When a
// previously-saved slot is being edited, _savedSnapshot holds the
// pre-edit values so Cancel can restore them. _showIncompleteWarning
// is set when the user clicks Save on a draft with empty fields, and
// cleared on field change / Cancel / successful Save.
//
// On every onChange emit we strip _state, _savedSnapshot, and
// _showIncompleteWarning. ContactChannel in src/lib/types.ts stays
// pure.
type Slot = ContactChannel & {
  _state: 'draft' | 'saved'
  _savedSnapshot?: ContactChannel
  _showIncompleteWarning?: boolean
}

// Per-channel field error map. Keyed by slot id; each entry tracks
// which fields failed validation on the most recent Save click. We
// clear a field's error optimistically when the user types into it.
type FieldErrors = {
  label?: boolean
  value?: boolean
  when_to_use?: boolean
}

// Renders the owner's contact channels with a per-channel save state
// machine. Cards live in one of two states:
//   DRAFT  — expanded, 3 inputs editable, Save + Cancel button row
//            (Cancel removes the slot for fresh adds, restores from
//             snapshot for edit-in-progress).
//   SAVED  — collapsed summary (label + value), Edit pencil + Delete.
//
// Drafts never escape the component. Host only sees pure ContactChannel
// objects via onChange, fired only on:
//   • Save (transitions DRAFT → SAVED, possibly committing edits)
//   • Delete of a SAVED slot (Delete of a DRAFT slot is internal-only)
//
// Single warning element above the list with copy swap based on the
// most-specific trigger:
//   • If any slot has _showIncompleteWarning → "Finish setting up your
//     channel" (the user just attempted Save and we want them to fix
//     the row in front of them).
//   • else if any slot is in DRAFT state → "You have unsaved changes…"
//     (ambient reminder while typing).
//   • else hide.
//
// The data field on ContactChannel is `label`. The user-facing string
// for that field is "Contact" (per UX refinement, the schema field
// name didn't follow because it's load-bearing on PR A schema, PR B
// validator, and PR C prompt builder).
export function ContactChannelsForm({
  channels,
  onChange,
  maxChannels = DEFAULT_MAX_CHANNELS,
}: Props) {
  const { t } = useTranslation()

  // Initialize internal slot state from props. Every channel that
  // arrives via props is committed (came from DB / parent state) — so
  // it starts in SAVED state with itself as the snapshot.
  const [slots, setSlots] = useState<Slot[]>(() =>
    channels.map((c) => ({ ...c, _state: 'saved' as const, _savedSnapshot: c })),
  )
  const [errors, setErrors] = useState<Record<string, FieldErrors>>({})

  // Re-sync if the host swaps the channels prop (e.g. settings page
  // rehydrate after /api/settings/load resolves). We compare by JSON to
  // avoid loops since channels is rebuilt as a new reference on every
  // host setState.
  useEffect(() => {
    const fromProps = channels.map(
      (c) => ({ ...c, _state: 'saved' as const, _savedSnapshot: c }),
    )
    setSlots((prev) => {
      const stripped = prev
        .filter((s) => s._state === 'saved')
        .map(({ _state: _s, _savedSnapshot: _ss, _showIncompleteWarning: _w, ...pure }) => pure)
      if (JSON.stringify(stripped) === JSON.stringify(channels)) return prev
      return fromProps
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels])

  function emit(next: Slot[]) {
    // Strip internal fields. Host receives pure ContactChannel[].
    const pure = next
      .filter((s) => s._state === 'saved')
      .map(({ _state: _s, _savedSnapshot: _ss, _showIncompleteWarning: _w, ...rest }) => rest)
    onChange(pure)
  }

  function handleAdd() {
    if (slots.length >= maxChannels) return
    const blank: Slot = {
      id: crypto.randomUUID(),
      label: '',
      value: '',
      when_to_use: '',
      _state: 'draft',
      // No _savedSnapshot — fresh add has nothing to revert to.
      // Cancel on a fresh add removes the slot entirely; Cancel on an
      // edit-in-progress restores from snapshot. Same button label,
      // different behavior driven by snapshot presence.
    }
    setSlots([...slots, blank])
  }

  function handleFieldChange(id: string, patch: Partial<ContactChannel>) {
    setSlots(slots.map((s) =>
      s.id === id
        // Typing clears the per-slot incomplete-warning flag — the
        // user is responding to the prompt to fix it. Per-field errors
        // also clear optimistically below.
        ? { ...s, ...patch, _showIncompleteWarning: false }
        : s,
    ))
    setErrors((prev) => {
      const slotErrors = prev[id]
      if (!slotErrors) return prev
      const cleared: FieldErrors = { ...slotErrors }
      for (const key of Object.keys(patch) as Array<keyof ContactChannel>) {
        if (key === 'label' || key === 'value' || key === 'when_to_use') {
          delete cleared[key]
        }
      }
      return { ...prev, [id]: cleared }
    })
  }

  function validateSlot(slot: Slot): FieldErrors {
    const errs: FieldErrors = {}
    if (slot.label.trim().length === 0) errs.label = true
    if (slot.value.trim().length === 0) errs.value = true
    if (slot.when_to_use.trim().length === 0) errs.when_to_use = true
    return errs
  }

  function handleSave(id: string) {
    const slot = slots.find((s) => s.id === id)
    if (!slot) return
    const errs = validateSlot(slot)
    if (errs.label || errs.value || errs.when_to_use) {
      setErrors((prev) => ({ ...prev, [id]: errs }))
      // Flip the per-slot warning flag — drives the "Finish setting up
      // your channel" copy in the single warning element above the list.
      setSlots(slots.map((s) =>
        s.id === id ? { ...s, _showIncompleteWarning: true } : s,
      ))
      return
    }
    // Snapshot current values as the new committed baseline so a future
    // Edit-then-Cancel can revert here, not to the pre-this-Save value.
    const next = slots.map((s) =>
      s.id === id
        ? {
            ...s,
            _state: 'saved' as const,
            _showIncompleteWarning: false,
            _savedSnapshot: {
              id: s.id,
              label: s.label,
              value: s.value,
              when_to_use: s.when_to_use,
            },
          }
        : s,
    )
    setSlots(next)
    setErrors((prev) => {
      const { [id]: _, ...rest } = prev
      return rest
    })
    emit(next)
  }

  function handleEdit(id: string) {
    setSlots(slots.map((s) => (s.id === id ? { ...s, _state: 'draft' as const } : s)))
  }

  function handleCancel(id: string) {
    const slot = slots.find((s) => s.id === id)
    if (!slot) return
    if (slot._savedSnapshot) {
      // Edit-in-progress — restore from snapshot, return to SAVED. No
      // emit (host's committed array is unchanged).
      const snap = slot._savedSnapshot
      setSlots(
        slots.map((s) =>
          s.id === id
            ? {
                ...s,
                label: snap.label,
                value: snap.value,
                when_to_use: snap.when_to_use,
                _state: 'saved' as const,
                _showIncompleteWarning: false,
              }
            : s,
        ),
      )
      setErrors((prev) => {
        const { [id]: _, ...rest } = prev
        return rest
      })
    } else {
      // Fresh add — remove the slot entirely. Same effect as
      // handleDelete on a draft: no onChange (slot was never committed).
      setSlots(slots.filter((s) => s.id !== id))
      setErrors((prev) => {
        const { [id]: _, ...rest } = prev
        return rest
      })
    }
  }

  function handleDelete(id: string) {
    const slot = slots.find((s) => s.id === id)
    if (!slot) return
    const next = slots.filter((s) => s.id !== id)
    setSlots(next)
    setErrors((prev) => {
      const { [id]: _, ...rest } = prev
      return rest
    })
    // Only emit if the deleted slot was committed. Deleting a draft
    // doesn't change host state.
    if (slot._state === 'saved') emit(next)
  }

  // Enter inside label / value triggers Save. Inside when_to_use we
  // intentionally let the default newline behavior win (per design
  // decision — multi-line guidance is normal in that field).
  function handleEnterSave(id: string, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave(id)
    }
  }

  const atMax = slots.length >= maxChannels

  // Warning fires only when the user has clicked Save on a draft with
  // empty fields. Drafts that haven't yet been Save-attempted produce
  // no warning — the user has done nothing wrong yet, and showing a
  // warning on Add click is disorienting. Server-side
  // filterCompleteChannels still drops half-typed rows on the parent
  // form's Continue/Save click, so an unsaved draft never poisons
  // the persisted state.
  const showWarning = slots.some((s) => s._showIncompleteWarning)

  return (
    <div>
      {showWarning && (
        <div className={styles.unsavedWarning} role="alert" aria-live="polite">
          {t.channelUnsavedWarning}
        </div>
      )}

      {slots.length > 0 && (
        <div className={styles.list}>
          {slots.map((slot) =>
            slot._state === 'saved'
              ? renderSavedRow(slot)
              : renderDraftRow(slot),
          )}
        </div>
      )}

      <button
        type="button"
        className={styles.addButton}
        disabled={atMax}
        onClick={handleAdd}
      >
        {atMax ? t.channelAddButtonAtMax : t.channelAddButton}
      </button>
    </div>
  )

  function renderSavedRow(slot: Slot) {
    return (
      <div key={slot.id} className={styles.summary}>
        <div className={styles.summaryText}>
          <div className={styles.summaryLabel}>{slot.label}</div>
          <div className={styles.summaryValue}>{slot.value}</div>
        </div>
        <div className={styles.summaryActions}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={t.channelEditAria}
            onClick={() => handleEdit(slot.id)}
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="m18.5 2.5 a2.121 2.121 0 0 1 3 3 L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={t.channelDeleteAria}
            onClick={() => handleDelete(slot.id)}
          >
            ×
          </button>
        </div>
      </div>
    )
  }

  function renderDraftRow(slot: Slot) {
    const slotErrors = errors[slot.id] ?? {}
    const labelErrId = `channel-${slot.id}-label-error`
    const valueErrId = `channel-${slot.id}-value-error`
    const whenErrId = `channel-${slot.id}-when-error`

    return (
      <div key={slot.id} className={styles.row}>
        <div className={styles.rowField}>
          <label className={styles.rowLabel} htmlFor={`channel-label-${slot.id}`}>
            {t.channelContactHeader}
          </label>
          <input
            id={`channel-label-${slot.id}`}
            type="text"
            className={`${styles.input} ${slotErrors.label ? styles.inputError : ''}`}
            value={slot.label}
            placeholder={t.channelContactPlaceholder}
            maxLength={LABEL_MAX}
            autoComplete="off"
            aria-invalid={!!slotErrors.label || undefined}
            aria-describedby={slotErrors.label ? labelErrId : undefined}
            onChange={(e) => handleFieldChange(slot.id, { label: e.target.value })}
            onKeyDown={(e) => handleEnterSave(slot.id, e)}
          />
          {slotErrors.label && (
            <p id={labelErrId} className={styles.fieldError}>
              {t.channelFieldRequired}
            </p>
          )}
        </div>

        <div className={styles.rowField}>
          <label className={styles.rowLabel} htmlFor={`channel-value-${slot.id}`}>
            {t.channelValueHeader}
          </label>
          <input
            id={`channel-value-${slot.id}`}
            type="text"
            className={`${styles.input} ${slotErrors.value ? styles.inputError : ''}`}
            value={slot.value}
            placeholder={t.channelValuePlaceholder}
            maxLength={VALUE_MAX}
            autoComplete="off"
            aria-invalid={!!slotErrors.value || undefined}
            aria-describedby={slotErrors.value ? valueErrId : undefined}
            onChange={(e) => handleFieldChange(slot.id, { value: e.target.value })}
            onKeyDown={(e) => handleEnterSave(slot.id, e)}
          />
          {slotErrors.value && (
            <p id={valueErrId} className={styles.fieldError}>
              {t.channelFieldRequired}
            </p>
          )}
        </div>

        <div className={styles.rowField}>
          <label className={styles.rowLabel} htmlFor={`channel-when-${slot.id}`}>
            {t.channelWhenToUseHeader}
          </label>
          <textarea
            id={`channel-when-${slot.id}`}
            className={`${styles.textarea} ${slotErrors.when_to_use ? styles.inputError : ''}`}
            value={slot.when_to_use}
            placeholder={t.channelWhenToUsePlaceholder}
            maxLength={WHEN_TO_USE_MAX}
            rows={2}
            aria-invalid={!!slotErrors.when_to_use || undefined}
            aria-describedby={slotErrors.when_to_use ? whenErrId : undefined}
            onChange={(e) => handleFieldChange(slot.id, { when_to_use: e.target.value })}
          />
          {slotErrors.when_to_use && (
            <p id={whenErrId} className={styles.fieldError}>
              {t.channelFieldRequired}
            </p>
          )}
        </div>

        <div className={styles.draftActions}>
          <button
            type="button"
            className={styles.saveButton}
            onClick={() => handleSave(slot.id)}
          >
            {t.channelSaveButton}
          </button>
          {/* Single Cancel button in DRAFT state. Behavior depends on
              whether the slot has a snapshot:
                • snapshot present (edit-in-progress) → restore from
                  snapshot, return to SAVED state.
                • no snapshot (fresh add) → remove the slot entirely.
              The button copy is "Cancel" in both contexts (R4). */}
          <button
            type="button"
            className={styles.cancelButton}
            onClick={() => handleCancel(slot.id)}
          >
            {t.channelCancelButton}
          </button>
        </div>
      </div>
    )
  }
}
