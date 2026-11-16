import { AgentAction, UserProfile, PortalCredential } from '../shared/types';
import { substituteProfileValues, normalizeDateToIso } from '../shared/vault';

const HIGHLIGHT_OVERLAY_ID = 'vp-active-highlight-overlay';

export function findElementByVpId(id: number, root: ParentNode = document): HTMLElement | null {
  const allMatches = root.querySelectorAll(`[data-vp-id="${id}"]`);
  for (let i = 0; i < allMatches.length; i++) {
    const el = allMatches[i];
    if (el instanceof HTMLElement) {
      // Prioritize visible elements
      if (el.offsetParent !== null || (el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0)) {
        return el;
      }
    }
  }

  // Fallback to first HTMLElement match if none explicitly measured visible
  if (allMatches.length > 0 && allMatches[0] instanceof HTMLElement) {
    return allMatches[0];
  }

  const allNodes = root.querySelectorAll('*');
  for (let i = 0; i < allNodes.length; i++) {
    const el = allNodes[i];
    if (el.shadowRoot) {
      const found = findElementByVpId(id, el.shadowRoot);
      if (found) return found;
    }
  }

  const iframes = root.querySelectorAll('iframe');
  for (let i = 0; i < iframes.length; i++) {
    try {
      const iframeDoc = iframes[i].contentDocument;
      if (iframeDoc) {
        const found = findElementByVpId(id, iframeDoc);
        if (found) return found;
      }
    } catch {
      // Cross-origin iframe
    }
  }

  return null;
}

export function highlightElement(element: HTMLElement): void {
  clearHighlights();

  const rect = element.getBoundingClientRect();
  const overlay = document.createElement('div');
  overlay.id = HIGHLIGHT_OVERLAY_ID;
  overlay.style.position = 'fixed';
  overlay.style.left = `${rect.left}px`;
  overlay.style.top = `${rect.top}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
  overlay.style.pointerEvents = 'none';
  overlay.style.border = '2px solid #3b82f6';
  overlay.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
  overlay.style.borderRadius = '4px';
  overlay.style.zIndex = '2147483647';
  overlay.style.transition = 'all 0.2s ease-in-out';
  overlay.style.boxShadow = '0 0 10px rgba(59, 130, 246, 0.5)';

  document.body.appendChild(overlay);

  setTimeout(() => {
    overlay.remove();
  }, 2500);
}

export function clearHighlights(): void {
  const existing = document.getElementById(HIGHLIGHT_OVERLAY_ID);
  if (existing) {
    existing.remove();
  }
}

export function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

  if (descriptor && descriptor.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }

  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

export interface ActionResult {
  success: boolean;
  action: AgentAction;
  error?: string;
}


export function findActiveScrollContainer(root: ParentNode = document): HTMLElement | null {
  const all = root.querySelectorAll('*');
  let best: HTMLElement | null = null;
  let maxArea = 0;

  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (!(el instanceof HTMLElement)) continue;
    if (el.scrollHeight <= el.clientHeight + 10) continue;

    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    const overflow = style.overflow;
    const isScrollable =
      overflowY === 'auto' ||
      overflowY === 'scroll' ||
      overflow === 'auto' ||
      overflow === 'scroll';

    if (isScrollable) {
      const rect = el.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > maxArea && rect.width > 80 && rect.height > 80) {
        maxArea = area;
        best = el;
      }
    }
  }

  return best;
}

export const ALIAS_GROUPS: string[][] = [
  // Degrees
  ['btech', 'b.tech', 'b tech', 'bachelor of technology', 'be', 'b.e', 'b.e.', 'bachelor of engineering'],
  ['mtech', 'm.tech', 'm tech', 'master of technology', 'me', 'm.e', 'm.e.', 'master of engineering'],
  ['bsc', 'b.sc', 'b sc', 'bachelor of science'],
  ['msc', 'm.sc', 'm sc', 'master of science'],
  ['mca', 'master of computer applications'],
  ['mba', 'master of business administration'],
  ['bba', 'bachelor of business administration'],
  ['phd', 'ph.d', 'ph. d', 'doctor of philosophy', 'doctorate'],
  ['diploma', 'polytechnic'],
  // Gender
  ['male', 'm', 'boy', 'man'],
  ['female', 'f', 'girl', 'woman'],
  ['other', 'transgender', 'trans', 'non-binary'],
  // Category
  ['general', 'gen', 'open', 'ur', 'unreserved'],
  ['obc', 'obc-ncl', 'other backward classes'],
  ['sc', 'scheduled caste'],
  ['st', 'scheduled tribe'],
  ['ews', 'economically weaker section'],
];

export function matchSelectOption(selectEl: HTMLSelectElement, targetValue: string): number {
  if (!targetValue || !selectEl.options || selectEl.options.length === 0) return -1;

  const rawTarget = targetValue.trim();
  const cleanTarget = rawTarget.toLowerCase().replace(/[^a-z0-9]/g, '');

  // 1. Exact match (case-insensitive) on value or text
  for (let i = 0; i < selectEl.options.length; i++) {
    const opt = selectEl.options[i];
    if (!opt.value && !opt.text) continue;
    if (
      opt.value.trim().toLowerCase() === rawTarget.toLowerCase() ||
      opt.text.trim().toLowerCase() === rawTarget.toLowerCase()
    ) {
      return i;
    }
  }

  // 2. Alphanumeric match (ignoring dots, spaces, hyphens, slashes)
  if (cleanTarget) {
    for (let i = 0; i < selectEl.options.length; i++) {
      const opt = selectEl.options[i];
      const optValClean = opt.value.toLowerCase().replace(/[^a-z0-9]/g, '');
      const optTextClean = opt.text.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (optValClean && optValClean === cleanTarget) return i;
      if (optTextClean && optTextClean === cleanTarget) return i;
    }
  }

  // 3. Substring / Inclusion match
  for (let i = 0; i < selectEl.options.length; i++) {
    const opt = selectEl.options[i];
    const optTextLower = opt.text.toLowerCase().trim();
    const optValLower = opt.value.toLowerCase().trim();
    const targetLower = rawTarget.toLowerCase();

    // Skip placeholder options like "-- Select Degree --"
    if (opt.value === '' && optTextLower.startsWith('--')) continue;

    if (optTextLower && (optTextLower.includes(targetLower) || (targetLower.length >= 3 && targetLower.includes(optTextLower)))) {
      return i;
    }
    if (optValLower && (optValLower.includes(targetLower) || (targetLower.length >= 3 && targetLower.includes(optValLower)))) {
      return i;
    }
  }

  // 4. Academic & Domain-Specific Alias Dictionary
  for (const group of ALIAS_GROUPS) {
    const targetMatchesGroup = group.some(
      (alias) => alias.replace(/[^a-z0-9]/g, '') === cleanTarget || alias === rawTarget.toLowerCase()
    );
    if (targetMatchesGroup) {
      for (let i = 0; i < selectEl.options.length; i++) {
        const opt = selectEl.options[i];
        if (opt.value === '' && opt.text.toLowerCase().startsWith('--')) continue;
        const optVal = opt.value.toLowerCase();
        const optText = opt.text.toLowerCase();
        const optValClean = optVal.replace(/[^a-z0-9]/g, '');
        const optTextClean = optText.replace(/[^a-z0-9]/g, '');

        const optionMatchesGroup = group.some((alias) => {
          const aliasClean = alias.replace(/[^a-z0-9]/g, '');
          return (
            aliasClean === optValClean ||
            aliasClean === optTextClean ||
            optVal.includes(alias) ||
            optText.includes(alias)
          );
        });
        if (optionMatchesGroup) {
          return i;
        }
      }
    }
  }

  return -1;
}

export function selectOptionInElement(el: HTMLSelectElement, value: string): boolean {
  const matchIdx = matchSelectOption(el, value);
  if (matchIdx >= 0) {
    el.selectedIndex = matchIdx;
    el.value = el.options[matchIdx].value;
  } else if (el.options.length > 0) {
    el.value = value;
  }

  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return matchIdx >= 0;
}

export async function executeSingleAction(
  action: AgentAction,
  profile: UserProfile = {},
  portalCred?: PortalCredential | null
): Promise<ActionResult> {
  try {
    switch (action.type) {
      case 'type': {
        const el = findElementByVpId(action.id);
        if (!el) {
          return { success: false, action, error: `Element with id ${action.id} not found` };
        }

        let resolvedValue = substituteProfileValues(action.value, profile, portalCred);
        resolvedValue = resolvedValue.replace(/\{(?:profile|portal)\.[a-zA-Z0-9_.-]+\}/g, '');

        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise((r) => setTimeout(r, 200));
        highlightElement(el);
        el.focus();

        // 1. Fallback for <select> elements when LLM plans a 'type' action
        if (el instanceof HTMLSelectElement) {
          selectOptionInElement(el, resolvedValue);
          el.dispatchEvent(new Event('blur', { bubbles: true }));
          return { success: true, action };
        }

        // 2. Checkboxes / radios mistakenly targeted with 'type'
        if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
          const shouldCheck =
            resolvedValue === 'true' ||
            resolvedValue === '1' ||
            resolvedValue === 'yes' ||
            resolvedValue === 'on' ||
            resolvedValue === '';
          el.checked = shouldCheck;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
          return { success: true, action };
        }

        // 3. HTML5 Date Inputs - strictly require ISO YYYY-MM-DD
        if (el instanceof HTMLInputElement && el.type === 'date') {
          const isoDate = normalizeDateToIso(resolvedValue);
          setNativeValue(el, isoDate);
          try {
            el.value = isoDate;
            if (isoDate.includes('-')) {
              const [y, m, d] = isoDate.split('-').map(Number);
              if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
                (el as HTMLInputElement).valueAsDate = new Date(Date.UTC(y, m - 1, d));
              }
            }
          } catch {}
          el.dispatchEvent(new Event('blur', { bubbles: true }));
          return { success: true, action };
        }

        // 4. Standard text/number/email/tel inputs and textareas
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          setNativeValue(el, resolvedValue);
        } else if (el.isContentEditable) {
          el.textContent = resolvedValue;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          el.setAttribute('value', resolvedValue);
        }

        el.dispatchEvent(new Event('blur', { bubbles: true }));
        return { success: true, action };
      }

      case 'click': {
        const el = findElementByVpId(action.id);
        if (!el) {
          return { success: false, action, error: `Element with id ${action.id} not found` };
        }

        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise((r) => setTimeout(r, 200));
        highlightElement(el);

        // For checkboxes and radios, avoid dispatching both MouseEvent('click') AND calling el.click()
        // which toggles the checked state twice and leaves checkboxes unchecked.
        if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
          el.click();
          return { success: true, action };
        }

        const mouseEvents = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
        for (const evName of mouseEvents) {
          const ev = new MouseEvent(evName, {
            bubbles: true,
            cancelable: true,
            view: window,
          });
          el.dispatchEvent(ev);
        }

        if (typeof (el as HTMLElement).click === 'function') {
          (el as HTMLElement).click();
        }

        return { success: true, action };
      }

      case 'select': {
        const el = findElementByVpId(action.id);
        if (!el) {
          return { success: false, action, error: `Element with id ${action.id} not found` };
        }

        let resolvedValue = substituteProfileValues(action.value, profile, portalCred);
        resolvedValue = resolvedValue.replace(/\{(?:profile|portal)\.[a-zA-Z0-9_.-]+\}/g, '');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise((r) => setTimeout(r, 200));
        highlightElement(el);

        // 1. Native <select> elements
        if (el instanceof HTMLSelectElement) {
          selectOptionInElement(el, resolvedValue);
          el.dispatchEvent(new Event('blur', { bubbles: true }));
          return { success: true, action };
        }

        // 2. Fallback for text inputs / date inputs when LLM plans 'select'
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          if (el instanceof HTMLInputElement && el.type === 'date') {
            const isoDate = normalizeDateToIso(resolvedValue);
            setNativeValue(el, isoDate);
            try {
              el.value = isoDate;
            } catch {}
          } else if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
            el.checked = true;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            setNativeValue(el, resolvedValue);
          }
          el.dispatchEvent(new Event('blur', { bubbles: true }));
          return { success: true, action };
        }

        return { success: false, action, error: `Element ${action.id} is not an interactive input or select` };
      }

      case 'check': {
        const el = findElementByVpId(action.id);
        if (!el) {
          return { success: false, action, error: `Element with id ${action.id} not found` };
        }

        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise((r) => setTimeout(r, 200));
        highlightElement(el);

        if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
          el.checked = action.checked;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return { success: true, action };
        }

        return { success: false, action, error: `Element ${action.id} is not a checkbox or radio` };
      }

      case 'scroll': {
        const direction = action.direction || 'down';
        const amount = action.amount || 450;

        // A. Target specific element by ID (or container)
        if (typeof action.id === 'number') {
          const el = findElementByVpId(action.id);
          if (el) {
            if (el.scrollHeight > el.clientHeight + 15) {
              const delta = direction === 'up' ? -amount : amount;
              el.scrollBy({ top: delta, behavior: 'smooth' });
            } else {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            await new Promise((r) => setTimeout(r, 350));
            highlightElement(el);
            return { success: true, action };
          }
        }

        // B. Page-level scrolling (with viewport & SPA container fallback)
        const prevScrollY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;

        if (direction === 'bottom') {
          const maxH = Math.max(
            document.body.scrollHeight || 0,
            document.documentElement.scrollHeight || 0,
            10000
          );
          window.scrollTo({ top: maxH, behavior: 'smooth' });
          if (document.documentElement) document.documentElement.scrollTo({ top: maxH, behavior: 'smooth' });
          if (document.body) document.body.scrollTo({ top: maxH, behavior: 'smooth' });
        } else if (direction === 'top') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          if (document.documentElement) document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
          if (document.body) document.body.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          const delta = direction === 'down' ? amount : -amount;
          window.scrollBy({ top: delta, behavior: 'smooth' });
          if (document.documentElement) document.documentElement.scrollBy({ top: delta, behavior: 'smooth' });
          if (document.body) document.body.scrollBy({ top: delta, behavior: 'smooth' });
        }

        await new Promise((r) => setTimeout(r, 180));
        const newScrollY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;

        // If window/documentElement scroll did not move (common in SPAs / ERP dashboards with overflow containers)
        if (Math.abs(newScrollY - prevScrollY) < 5) {
          const container = findActiveScrollContainer();
          if (container) {
            if (direction === 'bottom') {
              container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
            } else if (direction === 'top') {
              container.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
              const delta = direction === 'down' ? amount : -amount;
              container.scrollBy({ top: delta, behavior: 'smooth' });
            }
          }
        }

        // Allow smooth scroll animation to settle before next step
        await new Promise((r) => setTimeout(r, 220));
        return { success: true, action };
      }

      case 'wait': {
        const ms = Math.min(action.durationMs || 1000, 10000);
        await new Promise((r) => setTimeout(r, ms));
        return { success: true, action };
      }

      case 'ask_user': {
        return { success: true, action };
      }

      default:
        return { success: false, action, error: `Unhandled action type` };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, action, error: message };
  }
}

export async function executeActionBatch(
  actions: AgentAction[],
  profile: UserProfile = {},
  portalCred?: PortalCredential | null
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];

  for (const act of actions) {
    const res = await executeSingleAction(act, profile, portalCred);
    results.push(res);
    if (!res.success) {
      break;
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  return results;
}
