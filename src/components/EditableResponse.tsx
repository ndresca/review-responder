'use client'

import { useState, useRef, useEffect } from 'react'
import { useTranslation } from '@/lib/i18n-client'
import styles from './editable-response.module.css'

interface EditableResponseProps {
  response: string
  tagLabel?: string
  onSave?: (text: string) => void
}

export default function EditableResponse({
  response,
  tagLabel,
  onSave,
}: EditableResponseProps) {
  const { t } = useTranslation()
  const effectiveTagLabel = tagLabel ?? t.editableResponseSent

  const [mode, setMode] = useState<'view' | 'edit' | 'sending' | 'confirmed'>('view')
  const [text, setText] = useState(response)
  const [displayText, setDisplayText] = useState(response)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (mode === 'edit' && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length
      )
    }
  }, [mode])

  function handleSave() {
    setMode('sending')
    setTimeout(() => {
      setDisplayText(text)
      onSave?.(text)
      setMode('confirmed')
      setTimeout(() => setMode('view'), 2000)
    }, 1200)
  }

  function handleCancel() {
    setText(displayText)
    setMode('view')
  }

  if (mode === 'edit' || mode === 'sending') {
    return (
      <div className={styles.editWrap}>
        <div className={styles.editLabel}>{t.editableEditLabel}</div>
        <textarea
          ref={textareaRef}
          className={styles.editTextarea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={mode === 'sending'}
        />
        <div className={styles.editActions}>
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={mode === 'sending'}
          >
            {mode === 'sending' ? t.editableSending : t.editableSaveAndResend}
          </button>
          {mode !== 'sending' && (
            <button className={styles.cancelLink} onClick={handleCancel}>
              {t.editableCancel}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className={styles.responseWrap}>
        <div className={styles.responseTag}>{effectiveTagLabel}</div>
        <p className={styles.responseBody}>{displayText}</p>
      </div>
      {mode === 'confirmed' ? (
        <span className={styles.confirmation}>{t.editableUpdated}</span>
      ) : (
        <button className={styles.editLink} onClick={() => setMode('edit')}>
          {t.editableEditReply}
        </button>
      )}
    </div>
  )
}
