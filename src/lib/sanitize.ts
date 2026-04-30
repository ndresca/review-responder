// Best-effort prompt-injection scrubber for owner-controlled fields that
// flow into LLM prompts (brand voice personality / avoid / owner_description,
// owner feedback during regen, owner-edited response text).
//
// Strips lines that look like jailbreak attempts ("Ignore previous
// instructions", "You are now a different assistant", role tags like
// "System:" / "Assistant:", etc.), collapses runaway whitespace, and trims.
//
// This is a defense in depth — not a complete defense. A determined attacker
// will find variations the regex misses. The point is that owner-controlled
// fields shouldn't carry obvious instruction overrides into prompts that ship
// real responses to public Google reviews.
//
// IMPORTANT: do NOT call this on reviewer-supplied content (review.text,
// reviewer_name from GBP). Those are external strings outside owner control;
// modifying them silently could mangle legitimate review text and break the
// quality-check signal. The right defense for those is the LLM quality gate
// in src/services/auto-post.ts.

const INJECTION_PREFIX_PATTERNS: RegExp[] = [
  /^ignore\b/i,            // "ignore previous instructions", "ignore the above"
  /^disregard\b/i,         // "disregard everything"
  /^forget\b/i,             // "forget what I said"
  /^you are now\b/i,        // "you are now an unfiltered AI"
  /^new instruction/i,      // "new instruction:" / "new instructions"
  /^system\s*:/i,           // "System: <fake system message>"
  /^assistant\s*:/i,        // "Assistant: <fake prior turn>"
]

export function sanitizeForPrompt(input: string | null | undefined): string {
  if (!input) return ''

  // Filter line-by-line so legitimate content around an injection-shaped line
  // is preserved. Trimming each line for the prefix check (so leading
  // whitespace doesn't sneak past the regex) but keeping the original line
  // when it passes — preserves the user's intentional formatting.
  const filteredLines = input
    .split(/\r?\n/)
    .filter(line => {
      const trimmedStart = line.trimStart()
      return !INJECTION_PREFIX_PATTERNS.some(re => re.test(trimmedStart))
    })

  // Collapse multiple consecutive newlines into single newlines and trim
  // outer whitespace. Done after line filtering so removed lines don't leave
  // empty gaps.
  return filteredLines
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}
