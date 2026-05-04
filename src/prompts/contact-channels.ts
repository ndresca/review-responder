import { sanitizeForPrompt } from '@/lib/sanitize'
import type { ContactChannel } from '@/lib/types'

// Renders the owner's allowlisted contact channels as a prompt block.
//
// Sanitizes `label` and `when_to_use` (free-text owner-controlled fields
// that flow into the prompt) but leaves `value` raw — sanitizing the
// literal string the AI may insert would risk mangling URLs/emails and
// would break round-trip equality with the validator's allowlist check.
//
// Channels with empty `when_to_use` after sanitize are skipped — a channel
// without usage guidance is incomplete, and PR D's UI will validate the
// field is non-empty before save. This is a defensive backstop.
//
// Returns '' when no usable channels remain. Callers gate inclusion on
// truthiness:
//
//   const block = formatContactChannels(brandVoice.contact_channels)
//   if (block) { …include in prompt… }
//
// Non-empty output starts with a leading newline so it can be interpolated
// directly into a template literal between adjacent blocks without manual
// spacing — same convention as formatExistingResponses in calibration.ts.
export function formatContactChannels(channels: ContactChannel[]): string {
  if (channels.length === 0) return ''

  const lines: string[] = []
  let index = 0
  for (const channel of channels) {
    const label = sanitizeForPrompt(channel.label)
    const whenToUse = sanitizeForPrompt(channel.when_to_use)
    if (!whenToUse) continue
    index += 1
    lines.push(`${index}. ${label}`)
    lines.push(`   Value: ${channel.value}`)
    lines.push(`   When to use: ${whenToUse}`)
    lines.push('')
  }
  if (index === 0) return ''

  // Drop the trailing blank line we always push after each channel.
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()

  const intro =
    'The owner has configured the following channels you MAY reference. ' +
    'Use them only when the situation matches the "When to use" guidance ' +
    'for that specific channel. Do not invent or modify the values. ' +
    'If multiple channels could apply, choose the one that best fits the ' +
    "customer's situation. If none apply, do not include any contact channel."

  return [
    '',
    'CONTACT CHANNELS',
    '────────────────',
    intro,
    '',
    ...lines,
  ].join('\n')
}
