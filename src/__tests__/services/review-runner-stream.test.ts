import { describe, it, expect } from 'vitest';
import { extractStreamContent } from '../../services/review-runner.service';

describe('extractStreamContent', () => {
  it('extracts text_delta from stream_event envelope', () => {
    const event = {
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'text_delta', text: 'hello' },
      },
      session_id: 'test',
    };
    const result = extractStreamContent(event);
    expect(result).toEqual({ type: 'cli_text', text: 'hello' });
  });

  it('extracts thinking_delta from stream_event envelope', () => {
    const event = {
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'reasoning...' },
      },
      session_id: 'test',
    };
    const result = extractStreamContent(event);
    expect(result).toEqual({ type: 'cli_thinking', text: 'reasoning...' });
  });

  it('returns null for non-delta stream events', () => {
    const event = {
      type: 'stream_event',
      event: { type: 'message_start', message: {} },
      session_id: 'test',
    };
    const result = extractStreamContent(event);
    expect(result).toBeNull();
  });

  it('handles unwrapped content_block_delta (future-proofing)', () => {
    const event = {
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'text_delta', text: 'direct' },
    };
    const result = extractStreamContent(event);
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

  it('returns null when content_block_delta has no delta field', () => {
    const result = extractStreamContent({
      type: 'stream_event',
      event: { type: 'content_block_delta', index: 0 },
    });
    expect(result).toBeNull();
  });

  it('returns null for unknown delta types', () => {
    const result = extractStreamContent({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"key":' },
      },
    });
    expect(result).toBeNull();
  });

  it('returns null for null input', () => {
    expect(extractStreamContent(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(extractStreamContent(undefined)).toBeNull();
  });
});
