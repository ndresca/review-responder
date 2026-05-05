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

// Placeholder regex helpers — pinned to stable substrings of the new
// placeholders (R1 + R2). When-to-use placeholder is unchanged.
const RE_CONTACT_PLACEHOLDER = /email, instagram, phone number/i
const RE_VALUE_PLACEHOLDER = /support@business\.com/i
const RE_WHEN_PLACEHOLDER = /negative reviews/i

// Fill in a fresh draft card's three fields. Used by tests that need
// to drive a draft to saveable state.
function fillDraft(label: string, value: string, whenToUse: string) {
  fireEvent.change(screen.getByPlaceholderText(RE_CONTACT_PLACEHOLDER), { target: { value: label } })
  fireEvent.change(screen.getByPlaceholderText(RE_VALUE_PLACEHOLDER), { target: { value } })
  fireEvent.change(screen.getByPlaceholderText(RE_WHEN_PLACEHOLDER), { target: { value: whenToUse } })
}

// Copy fragments for warning copy assertions. We test against stable
// substrings rather than the full string so future copy tweaks don't
// silently break tests that should be testing behavior.
const RE_INCOMPLETE_WARNING = /finish setting up your channel/i
const RE_DRAFT_PRESENT_WARNING = /unsaved changes/i

describe('<ContactChannelsForm />', () => {
  // 1
  it('renders only the Add button when channels=[]', () => {
    render(<ContactChannelsForm channels={[]} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /\+ Add channel/i })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByPlaceholderText(RE_CONTACT_PLACEHOLDER)).toBeNull()
  })

  // 2
  it('clicking Add expands a new draft card on screen (no onChange)', () => {
    const onChange = vi.fn()
    render(<ContactChannelsForm channels={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ Add channel/i }))
    expect(screen.getByPlaceholderText(RE_CONTACT_PLACEHOLDER)).toBeTruthy()
    expect(screen.getByPlaceholderText(RE_VALUE_PLACEHOLDER)).toBeTruthy()
    expect(screen.getByPlaceholderText(RE_WHEN_PLACEHOLDER)).toBeTruthy()
    expect(screen.getByRole('button', { name: /save channel/i })).toBeTruthy()
    expect(onChange).not.toHaveBeenCalled()
  })

  // 3
  it('typing in a draft updates the input value (controlled, no onChange)', () => {
    const onChange = vi.fn()
    render(<ContactChannelsForm channels={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ Add channel/i }))
    const labelInput = screen.getByPlaceholderText(RE_CONTACT_PLACEHOLDER) as HTMLInputElement
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
    expect((emitted[0] as Record<string, unknown>)._showIncompleteWarning).toBeUndefined()

    expect(screen.queryByPlaceholderText(RE_CONTACT_PLACEHOLDER)).toBeNull()
    expect(screen.getByText('Customer service')).toBeTruthy()
    expect(screen.getByText('support@pinks.com')).toBeTruthy()
  })

  // 7
  it('initial channels prop arrives as SAVED state — no Save button visible', () => {
    render(<ContactChannelsForm channels={[CH({ id: 'a' })]} onChange={() => {}} />)
    expect(screen.queryByRole('button', { name: /save channel/i })).toBeNull()
    expect(screen.getByRole('button', { name: /edit channel/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /delete channel/i })).toBeTruthy()
    expect(screen.getByText('Customer service')).toBeTruthy()
    expect(screen.getByText('support@pinks.com')).toBeTruthy()
    expect(screen.queryByText(/follow-up/i)).toBeNull()
  })

  // 8
  it('clicking Edit on a saved card transitions to draft (no onChange)', () => {
    const onChange = vi.fn()
    render(<ContactChannelsForm channels={[CH({ id: 'a' })]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /edit channel/i }))
    const labelInput = screen.getByPlaceholderText(RE_CONTACT_PLACEHOLDER) as HTMLInputElement
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
    fireEvent.change(screen.getByPlaceholderText(RE_CONTACT_PLACEHOLDER), { target: { value: 'Modified' } })
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.queryByRole('button', { name: /save channel/i })).toBeNull()
    expect(screen.getByText('Original')).toBeTruthy()
    expect(screen.queryByText('Modified')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  // 10 — REWRITE: fresh-Add now shows Cancel (not "Delete channel")
  it('Cancel IS shown on a fresh draft (replacing the old "Delete channel" text button)', () => {
    render(<ContactChannelsForm channels={[]} onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ Add channel/i }))
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeTruthy()
    // The saved-state × button is NOT rendered for a draft — only its
    // text-link sibling existed before R4. Now there's no "Delete
    // channel" button visible while in draft state.
    expect(screen.queryByRole('button', { name: /delete channel/i })).toBeNull()
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

  // 12 — REWRITE: fresh-Add Cancel removes slot, no emit
  it('clicking Cancel on a fresh draft removes the card without emitting onChange', () => {
    const onChange = vi.fn()
    render(<ContactChannelsForm channels={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ Add channel/i }))
    expect(screen.getByPlaceholderText(RE_CONTACT_PLACEHOLDER)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.queryByPlaceholderText(RE_CONTACT_PLACEHOLDER)).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  // 13
  it('disables Add at 5 cards (saved + drafts both count toward cap)', () => {
    const channels = Array.from({ length: 4 }, (_, i) => CH({ id: `c${i}` }))
    render(<ContactChannelsForm channels={channels} onChange={() => {}} />)
    expect((screen.getByRole('button', { name: /\+ Add channel/i }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /\+ Add channel/i }))
    const addBtn = screen.getByRole('button', { name: /maximum 5 channels/i }) as HTMLButtonElement
    expect(addBtn.disabled).toBe(true)
  })

  // 14 — REWRITE: warning timing per R5/R6 (Option B copy-swap)
  it('warning does NOT appear on Add alone; appears with R5 copy after Save with empty fields', () => {
    render(<ContactChannelsForm channels={[]} onChange={() => {}} />)
    expect(screen.queryByRole('alert')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /\+ Add channel/i }))
    // After Add, a draft exists but no Save attempt yet → R6 fallback
    // shows ("You have unsaved changes…"). The R5 copy is NOT visible.
    const alertAfterAdd = screen.getByRole('alert')
    expect(alertAfterAdd.textContent).toMatch(RE_DRAFT_PRESENT_WARNING)
    expect(alertAfterAdd.textContent).not.toMatch(RE_INCOMPLETE_WARNING)

    // Click Save with all 3 fields empty → copy swaps to R5.
    fireEvent.click(screen.getByRole('button', { name: /save channel/i }))
    const alertAfterSave = screen.getByRole('alert')
    expect(alertAfterSave.textContent).toMatch(RE_INCOMPLETE_WARNING)
    expect(alertAfterSave.textContent).not.toMatch(RE_DRAFT_PRESENT_WARNING)

    // Type into label — clears the per-slot incomplete flag, copy
    // reverts to R6 (draft still exists).
    fireEvent.change(screen.getByPlaceholderText(RE_CONTACT_PLACEHOLDER), { target: { value: 'X' } })
    const alertAfterType = screen.getByRole('alert')
    expect(alertAfterType.textContent).toMatch(RE_DRAFT_PRESENT_WARNING)
    expect(alertAfterType.textContent).not.toMatch(RE_INCOMPLETE_WARNING)

    // Cancel — slot removed, no drafts left, warning disappears.
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  // 15
  it('Enter in label or value input triggers Save; Enter in when_to_use does not', () => {
    const onChange = vi.fn()
    render(<ContactChannelsForm channels={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ Add channel/i }))
    fillDraft('Customer service', 'support@pinks.com', 'urgent')

    fireEvent.keyDown(screen.getByPlaceholderText(RE_WHEN_PLACEHOLDER), { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /save channel/i })).toBeTruthy()

    fireEvent.keyDown(screen.getByPlaceholderText(RE_CONTACT_PLACEHOLDER), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  // 16
  it('field error clears optimistically when the user types into that field', () => {
    render(<ContactChannelsForm channels={[]} onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ Add channel/i }))
    fireEvent.click(screen.getByRole('button', { name: /save channel/i }))
    expect(screen.getAllByText(/required/i).length).toBeGreaterThanOrEqual(3)
    fireEvent.change(screen.getByPlaceholderText(RE_CONTACT_PLACEHOLDER), { target: { value: 'X' } })
    expect(screen.getAllByText(/required/i).length).toBeGreaterThanOrEqual(2)
    const labelField = screen.getByPlaceholderText(RE_CONTACT_PLACEHOLDER).closest('div')!
    expect(within(labelField).queryByText(/required/i)).toBeNull()
  })

  // 17 — NEW: R6 fallback warning appears on Add (before Save attempt)
  it('R6 fallback warning is visible after Add before any Save attempt', () => {
    render(<ContactChannelsForm channels={[]} onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ Add channel/i }))
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(RE_DRAFT_PRESENT_WARNING)
    expect(alert.getAttribute('aria-live')).toBe('polite')
  })

  // 18 — NEW: R5/R6 mutual exclusion
  it('R5 copy hides R6 copy when both conditions could apply (mutual exclusion)', () => {
    render(<ContactChannelsForm channels={[]} onChange={() => {}} />)
    // Two drafts so R6's "draft exists" condition is doubly true.
    fireEvent.click(screen.getByRole('button', { name: /\+ Add channel/i }))
    fireEvent.click(screen.getByRole('button', { name: /\+ Add channel/i }))
    // Trigger the per-slot flag on one of them by clicking Save with
    // empty fields. (getAllByRole picks the first save button.)
    const saveButtons = screen.getAllByRole('button', { name: /save channel/i })
    fireEvent.click(saveButtons[0])
    // R5 copy wins.
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(RE_INCOMPLETE_WARNING)
    expect(alert.textContent).not.toMatch(RE_DRAFT_PRESENT_WARNING)
  })

  // 19 — NEW: fresh-Add Cancel removes slot, warning vanishes if no other drafts
  it('clicking Cancel on the only fresh draft removes it and the warning vanishes', () => {
    render(<ContactChannelsForm channels={[]} onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ Add channel/i }))
    expect(screen.getByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByPlaceholderText(RE_CONTACT_PLACEHOLDER)).toBeNull()
  })

  // 20 — NEW: edit-Cancel restores from snapshot (distinct from fresh-Add Cancel)
  it('Cancel during edit-in-progress restores from snapshot, slot stays in SAVED', () => {
    const onChange = vi.fn()
    render(<ContactChannelsForm channels={[CH({ id: 'a', label: 'Original' })]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /edit channel/i }))
    fireEvent.change(screen.getByPlaceholderText(RE_CONTACT_PLACEHOLDER), { target: { value: 'Edited' } })
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    // Slot persists with original label (snapshot restored), Edit
    // pencil reappears, no Save button visible.
    expect(screen.getByRole('button', { name: /edit channel/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /save channel/i })).toBeNull()
    expect(screen.getByText('Original')).toBeTruthy()
    expect(screen.queryByText('Edited')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })
})
