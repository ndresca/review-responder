// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ContactChannelsForm } from './ContactChannelsForm'
import type { ContactChannel } from '@/lib/types'

// Stable UUID stub so newly added channels get predictable ids in tests.
// crypto.randomUUID is what handleAdd calls in the component itself.
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

describe('<ContactChannelsForm />', () => {
  it('renders the empty state when channels=[]', () => {
    render(<ContactChannelsForm channels={[]} onChange={() => {}} />)
    expect(screen.getByText(/no contact channels configured yet/i)).toBeTruthy()
    // Add button is enabled.
    const addBtn = screen.getByRole('button', { name: /\+ Add channel/i })
    expect(addBtn).toBeTruthy()
    expect((addBtn as HTMLButtonElement).disabled).toBe(false)
  })

  it('clicking Add appends a blank channel via onChange', () => {
    const onChange = vi.fn()
    render(<ContactChannelsForm channels={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ Add channel/i }))
    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as ContactChannel[]
    expect(next).toHaveLength(1)
    expect(next[0].label).toBe('')
    expect(next[0].value).toBe('')
    expect(next[0].when_to_use).toBe('')
    expect(next[0].id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('editing a field invokes onChange with patched channel', () => {
    const onChange = vi.fn()
    const channel = CH({ id: 'a', label: '', value: '', when_to_use: '' })
    render(<ContactChannelsForm channels={[channel]} onChange={onChange} />)

    const labelInput = screen.getByPlaceholderText(/WhatsApp Business/i) as HTMLInputElement
    fireEvent.change(labelInput, { target: { value: 'Email' } })

    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as ContactChannel[]
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('a')
    expect(next[0].label).toBe('Email')
  })

  it('clicking the × delete button removes that channel', () => {
    const onChange = vi.fn()
    const channels = [
      CH({ id: 'a', label: 'Email' }),
      CH({ id: 'b', label: 'Phone' }),
    ]
    render(<ContactChannelsForm channels={channels} onChange={onChange} />)

    const deleteButtons = screen.getAllByRole('button', { name: /delete channel/i })
    expect(deleteButtons).toHaveLength(2)
    fireEvent.click(deleteButtons[0])

    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as ContactChannel[]
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('b')
  })

  it('disables the Add button when at the maxChannels cap', () => {
    const channels = Array.from({ length: 5 }, (_, i) => CH({ id: `c${i}` }))
    render(<ContactChannelsForm channels={channels} onChange={() => {}} />)
    const addBtn = screen.getByRole('button', { name: /maximum 5 channels/i })
    expect((addBtn as HTMLButtonElement).disabled).toBe(true)
    // Click should not invoke onChange (handler returns early when at cap).
    const onChange = vi.fn()
    render(<ContactChannelsForm channels={channels} onChange={onChange} />)
    const disabledBtn = screen.getAllByRole('button', { name: /maximum 5 channels/i })[1]
    fireEvent.click(disabledBtn)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps the Add button enabled at 4 channels (one below cap)', () => {
    const channels = Array.from({ length: 4 }, (_, i) => CH({ id: `c${i}` }))
    const onChange = vi.fn()
    render(<ContactChannelsForm channels={channels} onChange={onChange} />)
    const addBtn = screen.getByRole('button', { name: /\+ Add channel/i }) as HTMLButtonElement
    expect(addBtn.disabled).toBe(false)
    act(() => {
      fireEvent.click(addBtn)
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect((onChange.mock.calls[0][0] as ContactChannel[])).toHaveLength(5)
  })
})
