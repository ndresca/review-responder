'use client'

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

// Renders the owner's contact channels as a list of grouped rows + an
// "Add channel" button. Each row is a self-contained card (mirroring the
// .calibCard visual pattern from onboarding step 3) so 3+ channels stay
// scannable instead of looking like one giant stack of inputs.
//
// Stateless — owner of the data passes channels + onChange. ID is
// generated on Add via crypto.randomUUID() and stays stable across
// edits / re-renders so React keys don't churn.
//
// PR D of 4. PRs A (#70 schema), B (#71 validator), C (#72 prompts)
// merged & deployed. This is the user-facing surface.
export function ContactChannelsForm({
  channels,
  onChange,
  maxChannels = DEFAULT_MAX_CHANNELS,
}: Props) {
  const { t } = useTranslation()

  function handleAdd() {
    if (channels.length >= maxChannels) return
    const next: ContactChannel = {
      id: crypto.randomUUID(),
      label: '',
      value: '',
      when_to_use: '',
    }
    onChange([...channels, next])
  }

  function handleEdit(id: string, patch: Partial<ContactChannel>) {
    onChange(channels.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  function handleDelete(id: string) {
    onChange(channels.filter((c) => c.id !== id))
  }

  const atMax = channels.length >= maxChannels

  return (
    <div>
      {channels.length === 0 ? (
        <p className={styles.empty}>{t.channelsEmpty}</p>
      ) : (
        <div className={styles.list}>
          {channels.map((channel) => (
            <div key={channel.id} className={styles.row}>
              <button
                type="button"
                className={styles.deleteButton}
                aria-label={t.channelDeleteAria}
                onClick={() => handleDelete(channel.id)}
              >
                ×
              </button>

              <div className={styles.rowField}>
                <label className={styles.rowLabel} htmlFor={`channel-label-${channel.id}`}>
                  {t.channelLabelHeader}
                </label>
                <input
                  id={`channel-label-${channel.id}`}
                  type="text"
                  className={styles.input}
                  value={channel.label}
                  placeholder={t.channelLabelPlaceholder}
                  maxLength={LABEL_MAX}
                  autoComplete="off"
                  onChange={(e) => handleEdit(channel.id, { label: e.target.value })}
                />
              </div>

              <div className={styles.rowField}>
                <label className={styles.rowLabel} htmlFor={`channel-value-${channel.id}`}>
                  {t.channelValueHeader}
                </label>
                <input
                  id={`channel-value-${channel.id}`}
                  type="text"
                  className={styles.input}
                  value={channel.value}
                  placeholder={t.channelValuePlaceholder}
                  maxLength={VALUE_MAX}
                  autoComplete="off"
                  onChange={(e) => handleEdit(channel.id, { value: e.target.value })}
                />
              </div>

              <div className={styles.rowField}>
                <label className={styles.rowLabel} htmlFor={`channel-when-${channel.id}`}>
                  {t.channelWhenToUseHeader}
                </label>
                <textarea
                  id={`channel-when-${channel.id}`}
                  className={styles.textarea}
                  value={channel.when_to_use}
                  placeholder={t.channelWhenToUsePlaceholder}
                  maxLength={WHEN_TO_USE_MAX}
                  rows={2}
                  onChange={(e) => handleEdit(channel.id, { when_to_use: e.target.value })}
                />
              </div>
            </div>
          ))}
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
}
