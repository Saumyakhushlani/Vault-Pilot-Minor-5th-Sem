import {
  AgentAction,
  ActionSafetyEvaluation,
  ActionSafetyLevel,
  ScannedElement,
  ExtensionSettings,
} from './types';

const IRREVERSIBLE_ACTION_REGEX = /\b(submit|final.?submit|pay|payment|proceed.?to.?pay|buy|purchase|checkout|delete|remove|destroy|terminate|transfer|place.?order|confirm.?and.?submit|agree.?and.?submit|apply.?now)\b/i;
const SENSITIVE_ACTION_REGEX = /\b(clear|reset|cancel|back|edit|logout|sign.?out|withdraw)\b/i;

export function classifyElementSafety(element?: ScannedElement): ActionSafetyLevel {
  if (!element) return 'benign';

  const descriptor = `${element.label || ''} ${element.value || ''} ${element.name || ''} ${element.type || ''} ${element.role || ''}`.trim().toLowerCase();

  if (IRREVERSIBLE_ACTION_REGEX.test(descriptor)) {
    return 'irreversible';
  }
  if (SENSITIVE_ACTION_REGEX.test(descriptor)) {
    return 'sensitive';
  }

  return 'benign';
}

export function evaluateActionSafety(
  action: AgentAction,
  elementsMap: Map<number, ScannedElement>,
  settings: Pick<ExtensionSettings, 'executionMode' | 'dryRun'>
): ActionSafetyEvaluation {
  if (settings.dryRun) {
    return {
      action,
      level: 'benign',
      requiresApproval: false,
      reason: 'Dry-run mode active: previewing action without DOM modification',
    };
  }

  if (settings.executionMode === 'step-by-step') {
    let targetLabel: string | undefined;
    let targetTag: string | undefined;
    if ('id' in action && elementsMap.has(action.id)) {
      const el = elementsMap.get(action.id);
      targetLabel = el?.label;
      targetTag = el?.tag;
    }

    return {
      action,
      level: 'sensitive',
      requiresApproval: true,
      reason: 'Step-by-Step mode enabled: manual confirmation required for every action',
      elementLabel: targetLabel,
      elementTag: targetTag,
    };
  }

  if ('id' in action) {
    const element = elementsMap.get(action.id);
    const level = classifyElementSafety(element);

    if (level === 'irreversible') {
      return {
        action,
        level: 'irreversible',
        requiresApproval: true,
        reason: `Target element "${element?.label || action.id}" is classified as an irreversible action (e.g. submit/payment/deletion). Explicit human approval is required.`,
        elementLabel: element?.label,
        elementTag: element?.tag,
      };
    }

    return {
      action,
      level: 'benign',
      requiresApproval: false,
      elementLabel: element?.label,
      elementTag: element?.tag,
    };
  }

  if (action.type === 'ask_user') {
    return {
      action,
      level: 'benign',
      requiresApproval: false,
    };
  }

  return {
    action,
    level: 'benign',
    requiresApproval: false,
  };
}

export function isDomainAllowed(url: string, allowList: string[]): boolean {
  if (!allowList || allowList.length === 0) {
    return true;
  }

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    for (const pattern of allowList) {
      const p = pattern.trim().toLowerCase();
      if (!p) continue;
      if (p === '*' || p === '<all_urls>') return true;
      if (hostname === p || hostname.endsWith(`.${p}`)) return true;
    }

    return false;
  } catch {
    return false;
  }
}
