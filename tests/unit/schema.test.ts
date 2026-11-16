import { describe, it, expect } from 'vitest';
import {
  parseAndValidateAgentResponse,
  validateAgentResponse,
  extractJsonFromText,
} from '../../src/shared/schema';

describe('Schema Validator', () => {
  it('extracts JSON from markdown code fences', () => {
    const markdown = 'Here is your plan:\n```json\n{\n  "thought": "I will click the link",\n  "actions": [{"type": "click", "id": 5}],\n  "status": "continue"\n}\n```\nHope this helps!';
    const json = extractJsonFromText(markdown);
    expect(json).toContain('"type": "click"');

    const res = parseAndValidateAgentResponse(markdown);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.thought).toBe('I will click the link');
      expect(res.data.actions).toHaveLength(1);
      expect(res.data.actions[0].type).toBe('click');
      expect(res.data.status).toBe('continue');
    }
  });

  it('validates a complete valid AgentResponse', () => {
    const raw = {
      thought: 'Filling application form with student details',
      actions: [
        { type: 'type', id: 1, value: '{profile.full_name}' },
        { type: 'select', id: 2, value: 'General' },
        { type: 'check', id: 3, checked: true },
        { type: 'click', id: 4 },
        { type: 'scroll', direction: 'down', amount: 500 },
        { type: 'wait', durationMs: 1000 },
        { type: 'ask_user', question: 'Please select your caste category', options: ['OBC', 'SC', 'ST'] },
      ],
      status: 'continue',
    };

    const res = validateAgentResponse(raw);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.actions).toHaveLength(7);
      expect(res.data.actions[0]).toEqual({ type: 'type', id: 1, value: '{profile.full_name}' });
      expect(res.data.actions[6]).toEqual({
        type: 'ask_user',
        question: 'Please select your caste category',
        options: ['OBC', 'SC', 'ST'],
      });
    }
  });

  it('rejects unsupported actions or malicious injection commands', () => {
    const malicious = {
      thought: 'Attempting arbitrary script injection',
      actions: [
        { type: 'eval', code: 'alert(document.cookie)' },
      ],
      status: 'continue',
    };

    const res = validateAgentResponse(malicious);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toContain('unsupported action type "eval"');
    }
  });

  it('rejects invalid action fields (e.g. negative id or non-string values)', () => {
    const invalidId = {
      thought: 'Bad id',
      actions: [{ type: 'click', id: -5 }],
      status: 'continue',
    };
    expect(validateAgentResponse(invalidId).success).toBe(false);

    const invalidValue = {
      thought: 'Bad value',
      actions: [{ type: 'type', id: 1, value: 12345 }],
      status: 'continue',
    };
    expect(validateAgentResponse(invalidValue).success).toBe(false);
  });

  it('validates and normalizes scroll actions with top, bottom, and id', () => {
    const raw = {
      thought: 'Scrolling page',
      actions: [
        { type: 'scroll', direction: 'bottom' },
        { type: 'scroll', direction: 'top' },
        { type: 'scroll', direction: 'down', amount: '600' },
        { type: 'scroll', id: 12 },
      ],
      status: 'continue',
    };

    const res = validateAgentResponse(raw);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.actions).toHaveLength(4);
      expect(res.data.actions[0]).toEqual({ type: 'scroll', direction: 'bottom', amount: 450 });
      expect(res.data.actions[1]).toEqual({ type: 'scroll', direction: 'top', amount: 450 });
      expect(res.data.actions[2]).toEqual({ type: 'scroll', direction: 'down', amount: 600 });
      expect(res.data.actions[3]).toEqual({ type: 'scroll', direction: 'down', amount: 450, id: 12 });
    }
  });

  it('rejects invalid status', () => {
    const invalidStatus = {
      thought: 'Done here',
      actions: [],
      status: 'completed', // Not in ['continue', 'done', 'blocked']
    };
    expect(validateAgentResponse(invalidStatus).success).toBe(false);
  });
});
