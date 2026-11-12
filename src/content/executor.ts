import { AgentAction, UserProfile, PortalCredential } from '../shared/types';
import { substituteProfileValues } from '../shared/vault';

const HIGHLIGHT_OVERLAY_ID = 'vp-active-highlight-overlay';

export function findElementByVpId(id: number, root: ParentNode = document): HTMLElement | null {
  const direct = root.querySelector(`[data-vp-id="${id}"]`);
  if (direct instanceof HTMLElement) {
    return direct;
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
        highlightElement(el);
        el.focus();

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
        highlightElement(el);

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
        highlightElement(el);

        if (el instanceof HTMLSelectElement) {
          let matched = false;
          const targetLower = resolvedValue.toLowerCase().trim();

          for (let i = 0; i < el.options.length; i++) {
            const opt = el.options[i];
            if (
              opt.value.toLowerCase() === targetLower ||
              opt.text.toLowerCase().includes(targetLower)
            ) {
              el.selectedIndex = i;
              matched = true;
              break;
            }
          }

          if (!matched && el.options.length > 0) {
            el.value = resolvedValue;
          }

          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, action };
        }

        return { success: false, action, error: `Element ${action.id} is not a <select> element` };
      }

      case 'check': {
        const el = findElementByVpId(action.id);
        if (!el) {
          return { success: false, action, error: `Element with id ${action.id} not found` };
        }

        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        const amount = action.amount || 400;
        const delta = direction === 'down' ? amount : -amount;

        window.scrollBy({ top: delta, behavior: 'smooth' });
        await new Promise((r) => setTimeout(r, 200));
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
