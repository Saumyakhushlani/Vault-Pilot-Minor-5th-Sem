import {
  AgentAction,
  AgentResponse,
  ClickAction,
  SelectAction,
  TypeAction,
  CheckAction,
  ScrollAction,
  WaitAction,
  AskUserAction,
  RunStatus,
} from './types';

export interface ValidationSuccess {
  success: true;
  data: AgentResponse;
}

export interface ValidationFailure {
  success: false;
  error: string;
  raw?: unknown;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

export function extractJsonFromText(rawText: string): string {
  if (!rawText || typeof rawText !== 'string') {
    return '';
  }

  const trimmed = rawText.trim();

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const fenceMatch = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed);
  if (fenceMatch && fenceMatch[1]) {
    const candidate = fenceMatch[1].trim();
    if (candidate.startsWith('{') && candidate.endsWith('}')) {
      return candidate;
    }
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.substring(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

export function validateAction(action: unknown, index: number): { valid: true; action: AgentAction } | { valid: false; error: string } {
  if (!action || typeof action !== 'object') {
    return { valid: false, error: `Action[${index}] must be a non-null object` };
  }

  const act = action as Record<string, unknown>;

  if (typeof act.type !== 'string') {
    return { valid: false, error: `Action[${index}] missing string "type"` };
  }

  let actType = (act.type as string).toLowerCase().trim();
  if (actType === 'input') {
    actType = 'type';
  }

  switch (actType) {
    case 'type': {
      if (typeof act.id !== 'number' || !Number.isInteger(act.id) || act.id < 0) {
        return { valid: false, error: `Action[${index}] (type) requires positive integer "id"` };
      }
      if (typeof act.value !== 'string') {
        return { valid: false, error: `Action[${index}] (type) requires string "value"` };
      }
      const typeAction: TypeAction = {
        type: 'type',
        id: act.id,
        value: act.value,
      };
      return { valid: true, action: typeAction };
    }

    case 'click': {
      if (typeof act.id !== 'number' || !Number.isInteger(act.id) || act.id < 0) {
        return { valid: false, error: `Action[${index}] (click) requires positive integer "id"` };
      }
      const clickAction: ClickAction = {
        type: 'click',
        id: act.id,
      };
      return { valid: true, action: clickAction };
    }

    case 'select': {
      if (typeof act.id !== 'number' || !Number.isInteger(act.id) || act.id < 0) {
        return { valid: false, error: `Action[${index}] (select) requires positive integer "id"` };
      }
      if (typeof act.value !== 'string') {
        return { valid: false, error: `Action[${index}] (select) requires string "value"` };
      }
      const selectAction: SelectAction = {
        type: 'select',
        id: act.id,
        value: act.value,
      };
      return { valid: true, action: selectAction };
    }

    case 'check': {
      if (typeof act.id !== 'number' || !Number.isInteger(act.id) || act.id < 0) {
        return { valid: false, error: `Action[${index}] (check) requires positive integer "id"` };
      }
      const checkedVal = act.checked !== undefined ? Boolean(act.checked) : (act.value !== undefined ? String(act.value).toLowerCase() === 'true' : true);
      const checkAction: CheckAction = {
        type: 'check',
        id: act.id,
        checked: checkedVal,
      };
      return { valid: true, action: checkAction };
    }

    case 'scroll': {
      let direction: 'up' | 'down' | undefined;
      if (act.direction !== undefined) {
        if (act.direction !== 'up' && act.direction !== 'down') {
          return { valid: false, error: `Action[${index}] (scroll) direction must be 'up' or 'down'` };
        }
        direction = act.direction;
      }
      let amount: number | undefined;
      if (act.amount !== undefined) {
        if (typeof act.amount !== 'number' || isNaN(act.amount)) {
          return { valid: false, error: `Action[${index}] (scroll) amount must be a number` };
        }
        amount = act.amount;
      }
      const scrollAction: ScrollAction = {
        type: 'scroll',
        direction,
        amount,
      };
      return { valid: true, action: scrollAction };
    }

    case 'wait': {
      let durationMs: number | undefined;
      if (act.durationMs !== undefined) {
        if (typeof act.durationMs !== 'number' || act.durationMs < 0 || act.durationMs > 30000) {
          return { valid: false, error: `Action[${index}] (wait) durationMs must be between 0 and 30000ms` };
        }
        durationMs = act.durationMs;
      }
      const waitAction: WaitAction = {
        type: 'wait',
        durationMs,
      };
      return { valid: true, action: waitAction };
    }

    case 'ask_user': {
      if (typeof act.question !== 'string' || act.question.trim().length === 0) {
        return { valid: false, error: `Action[${index}] (ask_user) requires non-empty "question" string` };
      }
      let options: string[] | undefined;
      if (act.options !== undefined) {
        if (!Array.isArray(act.options) || !act.options.every((opt) => typeof opt === 'string')) {
          return { valid: false, error: `Action[${index}] (ask_user) options must be an array of strings` };
        }
        options = act.options;
      }
      const askAction: AskUserAction = {
        type: 'ask_user',
        question: act.question.trim(),
        options,
      };
      return { valid: true, action: askAction };
    }

    default:
      return { valid: false, error: `Action[${index}] contains unsupported action type "${String(act.type)}"` };
  }
}

export function validateAgentResponse(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== 'object') {
    return { success: false, error: 'Agent response must be a valid JSON object', raw };
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.thought !== 'string') {
    return { success: false, error: 'Missing or non-string "thought" field', raw };
  }

  const validStatuses: RunStatus[] = ['continue', 'done', 'blocked'];
  if (typeof obj.status !== 'string' || !validStatuses.includes(obj.status as RunStatus)) {
    return {
      success: false,
      error: `Invalid "status" field: expected one of ${validStatuses.join(', ')}, got "${String(obj.status)}"`,
      raw,
    };
  }

  if (!Array.isArray(obj.actions)) {
    return { success: false, error: 'Missing or non-array "actions" field', raw };
  }

  const validatedActions: AgentAction[] = [];
  for (let i = 0; i < obj.actions.length; i++) {
    const actResult = validateAction(obj.actions[i], i);
    if (!actResult.valid) {
      return { success: false, error: actResult.error, raw };
    }
    validatedActions.push(actResult.action);
  }

  return {
    success: true,
    data: {
      thought: obj.thought,
      actions: validatedActions,
      status: obj.status as RunStatus,
    },
  };
}

export function parseAndValidateAgentResponse(text: string): ValidationResult {
  const jsonStr = extractJsonFromText(text);
  if (!jsonStr) {
    return { success: false, error: 'No JSON payload found in model output', raw: text };
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return validateAgentResponse(parsed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `JSON parse error: ${message}`, raw: text };
  }
}
