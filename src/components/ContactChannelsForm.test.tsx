// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ContactChannelsForm } from './ContactChannelsForm'
import type { ContactChannel } from '@/lib/types'

// Stable UUID stub so newly added channels get predictable ids in tests.
beforeEach(() => {
  let counter = 0
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
    counter += 1
    return `00000000-0000-0000-0000-${String(counter).padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}`
  })
})

const CH = (overrides: Partial<ContactChannel> = {}): ContactChannel => ({
  id: 'fixture-id',
  label: 'Customer service',
  value: 'support@pinks.com',
  when_to_use: 'for negative reviews where the customer needs follow-up',
  ...overrides,
})

// Fill in a fresh draft card's three fields. Used by tests that need
// to drive a draft to saveable state.
function fillDraft(label: string, value: string, whenToUse: string) {
  fireEvent.change(screen.getByPlaceholderText(/WhatsApp Business/i), { target: { value: label } })
  fireEvent.change(screen.getByPlaceholderText(/email, phone, handle, or URL/i), { target: { value } })
  fireEvent.change(screen.getByPlaceholderText(/negative reviews/i), { target: { value: whenToUse } })
}

describe('<ContactChannelsForm />', () => {
  // 1
  it('renders only the Add button when channels=[]', () => {
    render(<ContactChannelsForm channels={[]} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /\+ Add channel/i })).toBeTruthy()
    // No draft, no warning, no list.
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByPlaceholderText(/WhatsApp Business/i)).toBeNull()
  })

  // 2
  it('clicking Add expands a new draft card on screen (no onChange)', () => {
    const onChange = vi.fn()
    render(<ContactChannelsForm channels={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ Add channel/i }))
    // Three inputs visible, Save button visible.
    expect(screen.getByPlaceholderText(/WhatsApp Business/i)).toBeTruthy()
    expect(screen.getByPlaceholderText(/email, phone, handle, or URL/i)).toBeTruthy()
    expect(screen.getByPlaceholderText(/negative reviews/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /save channel/i })).toBeTruthy()
    // Drafts are internal — host should NOT see this yet.
    expect(onChange).not.toHaveBeenCalled()
  })

  // 3
  it('typing in a draft updates the input value (controlled, no onChange)', () => {
    const onChange = vi.fn()
    render(<ContactChannelsForm channels={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ Add channel/i }))
    const labelInput = screen.getByPlaceholderText(/WhatsApp Business/i) as HTMLInputElement
    fireEvent.change(labelInput, { target: { value: 'Email' } })
    expect(labelInput.value).toBe('Email')
    expect(onChange).not.toHaveBeenCalled()
  })

  // 4
  it('clicking Save with empty fields shows per-field errors and does NOT emit', () => {
    const onChange = vi.fn()
    render(<ContactChannelsForm channels={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ Add channel/i }))
    fireEvent.click(screen.getByRole('button', { name: /save channel/i }))
    const errors = screen.getAllByText(/required/i)
    expect(errors.length).toBeGreaterThanOrEqual(3)
    expect(onChange).not.toHaveBeenCalled()
  })

  // 5
  it('clicking Save with whitespace-only label shows error (matches server trim rule)', () => {
    const onChange = vi.fn()
    render(<ContactChannelsForm channels={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ Add channel/i }))
    fillDraft('   ', 'support@pinks.com', 'for negative reviews')
    fireEvent.click(screen.getByRole('button', { name: /save channel/i }))
    expect(screen.getAllByText(/required/i).length).toBeGreaterThanOrEqual(1)
    expect(onChange).not.toHaveBeenCalled()
  })

  // 6
  it('clicking Save with all 3 fields filled emits pure ContactChannel[] and collapses to summary', () => {
    const onChange = vi.fn()
    render(<ContactChannelsForm channels={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ Add channel/i }))
    fillDraft('Customer service', 'support@pinks.com', 'urgent issues')
    fireEvent.click(screen.getByRole('button', { name: /save channel/i }))

    expect(onChange).toHaveBeenCalledTimes(1)
    const emitted = onChange.mock.calls[0][0] as ContactChannel[]
    expect(emitted).toHaveLength(1)
    expect(emitted[0].label).toBe('Customer service')
    expect(emitted[0].value).toBe('support@pinks.com')
    expect(emitted[0].when_to_use).toBe('urgent issues')
    // Internal fields must never leak.
    expect((emitted[0] as Record<string, unknown>)._state).toBeUndefined()
    expect((emitted[0] as Record<string, unknown>)._savedSnapshot).toBeUndefined()

    // Inputs gone, summary visible.
    expect(screen.queryByPlaceholderText(/WhatsApp Business/i)).toBeNull()
    expect(screen.getByText('Customer service')).toBeTruthy()
    expect(screen.getByText('support@pinks.com')).toBeTruthy()
  })

  // 7
  it('initial channels prop arrives as SAVED state — no Save button visible', () => {
    render(<ContactChannelsForm channels={[CH({ id: 'a' })]} onChange={() => {}} />)
    expect(screen.queryByRole('button', { name: /save channel/i })).toBeNull()
    expect(screen.getByRole('button', { name: /edit channel/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /delete channel/i })).toBeTruthy()
    // Summary shows label + value, not the textarea contents.
    expect(screen.getByText('Customer service')).toBeTruthy()
    expect(screen.getByText('support@pinks.com')).toBeTruthy()
    expect(screen.queryByText(/follow-up/i)).toBeNull()
  })

  // 8
  it('clicking Edit on a saved card transitions to draft (no onChange)', () => {
    const onChange = vi.fn()
    render(<ContactChannelsForm channels={[CH({ id: 'a' })]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /edit channel/i }))
    // Inputs visible, populated with saved values.
    const labelInput = screen.getByPlaceholderText(/WhatsApp Business/i) as HTMLInputElement
    expect(labelInput.value).toBe('Customer service')
    expect(screen.getByRole('button', { name: /save channel/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeTruthy()
    expect(onChange).not.toHaveBeenCalled()
  })

  // 9
  it('clicking Cancel after Edit reverts fields to saved values (no onChange)', () => {
    const onChange = vi.fn()
    render(<ContactChannelsForm channels={[CH({ id: 'a', label: 'Original' })]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /edit channel/i }))
    fireEvent.change(screen.getByPlaceholderText(/WhatsApp Business/i), { target: { value: 'Modified' } })
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    // Back in SAVED state with original label.
    expect(screen.queryByRole('button', { name: /save channel/i })).toBeNull()
    expect(screen.getByText('Original')).toBeTruthy()
    expect(screen.queryByText('Modified')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  // 10
  it('Cancel is NOT shown on a fresh draft (Delete is the cancel-fresh-add path)', () => {
    render(<ContactChannelsForm channels={[]} onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ Add channel/i }))
    expect(screen.queryByRole('button', { name: /^cancel$/i })).toBeNull()
    expect(screen.getByRole('button', { name: /delete channel/i })).toBeTruthy()
  })

  // 11
  it('clicking Delete on a saved card removes it and emits pruned list', () => {
    const onChange = vi.fn()
    render(
      <ContactChannelsForm
        channels={[CH({ id: 'a', label: 'A' }), CH({ id: 'b', label: 'B' })]}
        onChange={onChange}
      />,
    )
    const deleteButtons = screen.getAllByRole('button', { name: /delete channel/i })
    fireEvent.click(deleteButtons[0])
    expect(onChange).toHaveBeenCalledTimes(1)
    const emitted = onChange.mock.calls[0][0] as ContactChannel[]
    expect(emitted).toHaveLength(1)
    expect(emitted[0].label).toBe('B')
  })

  // 12
  it('clicking Delete on a fresh draft removes the card without emitting onChange', () => {
    const onChange = vi.fn()
    render(<ContactChannelsForm channels={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ Add channel/i }))
    expect(screen.getByPlaceholderText(/WhatsApp Business/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /delete channel/i }))
    expect(screen.queryByPlaceholderText(/WhatsApp Business/i)).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  // 13
  it('disables Add at 5 cards (saved + drafts both count toward cap)', () => {
    const channels = Array.from({ length: 4 }, (_, i) => CH({ id: `c${i}` }))
    render(<ContactChannelsForm channels={channels} onChange={() => {}} />)
    // 4 saved cards. Add still enabled.
    expect((screen.getByRole('button', { name: /\+ Add channel/i }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /\+ Add channel/i }))
    // Now 4 saved + 1 draft = 5 cards. Add disabled with at-max label.
    const addBtn = screen.getByRole('button', { name: /maximum 5 channels/i }) as HTMLButtonElement
    expect(addBtn.disabled).toBe(true)
  })

  // 14
  it('inline unsaved warning appears with role=alert when ≥1 draft exists, vanishes when none', () => {
    render(<ContactChannelsForm channels={[]} onChange={() => {}} />)
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /\+ Add channel/i }))
    const alert = screen.getByRole('alert')
    expect(alert).toBeTruthy()
    expect(alert.getAttribute('aria-live')).toBe('polite')
    // Delete the draft → warning gone.
    fireEvent.click(screen.getByRole('button', { name: /delete channel/i }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  // 15
  it('Enter in label or value input triggers Save; Enter in when_to_use does not', () => {
    const onChange = vi.fn()
    render(<ContactChannelsForm channels={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ Add channel/i }))
    fillDraft('Customer service', 'support@pinks.com', 'urgent')

    // Enter in textarea — should NOT save (default newline behavior).
    fireEvent.keyDown(screen.getByPlaceholderText(/negative reviews/i), { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
    // Inputs still visible (no save happened).
    expect(screen.getByRole('button', { name: /save channel/i })).toBeTruthy()

    // Enter in label input — should save.
    fireEvent.keyDown(screen.getByPlaceholderText(/WhatsApp Business/i), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  // 16
  it('field error clears optimistically when the user types into that field', () => {
    render(<ContactChannelsForm channels={[]} onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ Add channel/i }))
    fireEvent.click(screen.getByRole('button', { name: /save channel/i }))
    expect(screen.getAllByText(/required/i).length).toBeGreaterThanOrEqual(3)
    // Type into label — its error should clear.
    fireEvent.change(screen.getByPlaceholderText(/WhatsApp Business/i), { target: { value: 'X' } })
    // The remaining count drops by exactly 1 (label's error gone).
    expect(screen.getAllByText(/required/i).length).toBeGreaterThanOrEqual(2)
    // We can't easily assert "exactly 2" here without more brittle DOM
    // querying; the within() approach below tightens the check.
    const labelField = screen.getByPlaceholderText(/WhatsApp Business/i).closest('div')!
    expect(within(labelField).queryByText(/required/i)).toBeNull()
  })
})
