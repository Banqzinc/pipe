# Fix CLI Streaming — `stream_event` Envelope Unwrapping

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix live CLI output streaming so thinking/text appears in real-time in the "Live Output" pane during reviews.

**Architecture:** The Claude CLI with `--output-format stream-json` wraps API streaming events inside a `{"type":"stream_event","event":{...}}` envelope. The current parser checks `event.type === 'content_block_delta'` at the top level, but the actual type at the top level is `"stream_event"`. The inner event must be unwrapped before matching.

**Tech Stack:** TypeScript, Node.js child_process, Express SSE, React EventSource

---

## Root Cause Analysis

Running `claude --print --verbose -p "..." --output-format stream-json --include-partial-messages` produces NDJSON where streaming events are wrapped:

```json
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"..."}},"session_id":"..."}
{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"..."}},"session_id":"..."}
```

But the `result` event is NOT wrapped — it appears at the top level:
```json
{"type":"result","subtype":"success","result":"...","session_id":"..."}
```

Current code in `src/services/review-runner.service.ts:271`:
```typescript
if (event.type === 'content_block_delta') {  // ← never matches! type is "stream_event"
```

The SSE infrastructure works — the "Starting Claude review..." phase message reaches the UI. Only `cli_text`/`cli_thinking` events are missing because the delta parser never matches.

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/services/review-runner.service.ts` | Modify (lines 268-286) | Unwrap `stream_event` envelope before matching inner event type |
| `src/services/__tests__/review-runner-stream.test.ts` | Create | Unit test for the stream event parsing logic |

---

### Task 1: Write failing test for `stream_event` envelope parsing

**Files:**
- Create: `src/__tests__/services/review-runner-stream.test.ts`

The stream parsing logic is embedded inside `spawnCli`'s stdout handler. To test it in isolation, extract the event-processing logic into a small pure function, then test it.

- [ ] **Step 1: Write the test file**

```typescript
// src/services/__tests__/review-runner-stream.test.ts
import { describe, it, expect } from 'vitest';
import { extractStreamContent } from '../review-runner.service';

describe('extractStreamContent', () => {
  it('extracts text_delta from stream_event envelope', () => {
    const line = JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'text_delta', text: 'hello' },
      },
      session_id: 'test',
    });
    const result = extractStreamContent(JSON.parse(line));
    expect(result).toEqual({ type: 'cli_text', text: 'hello' });
  });

  it('extracts thinking_delta from stream_event envelope', () => {
    const line = JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'reasoning...' },
      },
      session_id: 'test',
    });
    const result = extractStreamContent(JSON.parse(line));
    expect(result).toEqual({ type: 'cli_thinking', text: 'reasoning...' });
  });

  it('returns null for non-delta stream events', () => {
    const line = JSON.stringify({
      type: 'stream_event',
      event: { type: 'message_start', message: {} },
      session_id: 'test',
    });
    const result = extractStreamContent(JSON.parse(line));
    expect(result).toBeNull();
  });

  it('handles unwrapped content_block_delta (future-proofing)', () => {
    const line = JSON.stringify({
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'text_delta', text: 'direct' },
    });
    const result = extractStreamContent(JSON.parse(line));
    expect(result).toEqual({ type: 'cli_text', text: 'direct' });
  });

  it('returns null for result events', () => {
    const result = extractStreamContent({ type: 'result', result: 'test' });
    expect(result).toBeNull();
  });

  it('returns null for assistant partial message events', () => {
    const result = extractStreamContent({
      type: 'assistant',
      message: { content: [] },
    });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/__tests__/review-runner-stream.test.ts`
Expected: FAIL — `extractStreamContent` does not exist yet

---

### Task 2: Extract and fix the stream content parser

**Files:**
- Modify: `src/services/review-runner.service.ts:268-286`

- [ ] **Step 3: Add the exported `extractStreamContent` function**

Add this function above the `ReviewRunner` class (e.g. after the `sleep` and `mapSeverity` helpers, around line 36):

```typescript
/** Extract displayable content from a CLI stream-json event line.
 *  Returns { type, text } for content deltas, or null for non-content events. */
export function extractStreamContent(
  event: any,
): { type: 'cli_text' | 'cli_thinking'; text: string } | null {
  // Unwrap stream_event envelope: {"type":"stream_event","event":{...}}
  const inner = event.type === 'stream_event' ? event.event : event;
  if (!inner || inner.type !== 'content_block_delta') return null;

  if (inner.delta?.type === 'text_delta') {
    return { type: 'cli_text', text: inner.delta.text ?? '' };
  }
  if (inner.delta?.type === 'thinking_delta') {
    return { type: 'cli_thinking', text: inner.delta.thinking ?? '' };
  }
  return null;
}
```

- [ ] **Step 4: Update `spawnCli` to use `extractStreamContent`**

Replace lines 270-281 in the stdout handler:

```typescript
// OLD (lines 270-281):
// content_block_delta → accumulate text for live display
if (event.type === 'content_block_delta') {
  if (event.delta?.type === 'text_delta') {
    const text = event.delta.text ?? '';
    displayText += text;
    runEventBus.emit(runId, { type: 'cli_text', text });
  } else if (event.delta?.type === 'thinking_delta') {
    const text = event.delta.thinking ?? '';
    displayText += text;
    runEventBus.emit(runId, { type: 'cli_thinking', text });
  }
}

// NEW:
const content = extractStreamContent(event);
if (content) {
  displayText += content.text;
  runEventBus.emit(runId, content);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/services/__tests__/review-runner-stream.test.ts`
Expected: PASS — all 6 tests green

- [ ] **Step 6: Run full test suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: All tests pass, no type errors

- [ ] **Step 7: Commit**

```bash
git add src/services/review-runner.service.ts src/services/__tests__/review-runner-stream.test.ts
git commit -m "fix: unwrap stream_event envelope for CLI streaming

The Claude CLI --output-format stream-json wraps API events in
{type:'stream_event',event:{...}}. The parser was checking the
top-level type directly, so content_block_delta never matched."
```

---

## Verification

After the fix, start a review and confirm:
1. "Live Output" pane shows thinking and text content in real-time
2. Run completes with findings parsed correctly
3. "Raw Output" collapsible shows full CLI response after completion
4. No regressions in existing tests
