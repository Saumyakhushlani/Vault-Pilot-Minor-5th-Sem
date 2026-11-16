import { scanPage } from './scanner';
import {
  executeActionBatch,
  findElementByVpId,
  highlightElement,
  clearHighlights,
  executeSingleAction,
  ActionResult,
} from './executor';
import { AgentAction, UserProfile, WorkflowRecordedStep, PortalCredential } from '../shared/types';

// Top-level frame invariant:
// VaultPilot page automation, DOM scanning, and execution must run exclusively on the top-level window.
// Embedded subframes (such as Google reCAPTCHA, Cloudflare challenges, or third-party ads)
// must never intercept page-level automation messages.
if (typeof window !== 'undefined' && window !== window.top) {
  // Gracefully exit subframes
} else {
  console.log('[VaultPilot] Content script active on top window.');

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') {
    return false;
  }

  switch (message.type) {
    case 'PING': {
      sendResponse({ success: true, active: true });
      return true;
    }

    case 'SCAN_PAGE': {
      try {
        const scanResult = scanPage();
        sendResponse({ success: true, data: scanResult });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        sendResponse({ success: false, error: message });
      }
      return true;
    }

    case 'EXECUTE_ACTIONS': {
      const actions: AgentAction[] = message.actions || [];
      const profile: UserProfile = message.profile || {};
      const portalCred: PortalCredential | null = message.portalCred || null;

      executeActionBatch(actions, profile, portalCred)
        .then((results) => {
          sendResponse({ success: true, results });
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          sendResponse({ success: false, error: message });
        });
      return true;
    }

    case 'HIGHLIGHT_ELEMENT': {
      const id = message.id;
      if (typeof id === 'number') {
        const el = findElementByVpId(id);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          highlightElement(el);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: `Element ${id} not found` });
        }
      }
      return true;
    }

    case 'CLEAR_HIGHLIGHTS': {
      clearHighlights();
      sendResponse({ success: true });
      return true;
    }

    case 'REPLAY_WORKFLOW_STEPS': {
      const steps: WorkflowRecordedStep[] = message.steps || [];
      const profile: UserProfile = message.profile || {};

      (async () => {
        const results: ActionResult[] = [];
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          let targetEl: HTMLElement | null = null;

          if (step.selector) {
            try {
              const el = document.querySelector(step.selector);
              if (el instanceof HTMLElement) {
                targetEl = el;
              }
            } catch {
              // Ignore invalid selector
            }
          }

          if (!targetEl && 'id' in step.action && typeof step.action.id === 'number') {
            targetEl = findElementByVpId(step.action.id);
          }

          if (targetEl) {
            const tempId = 999000 + i;
            targetEl.setAttribute('data-vp-id', String(tempId));
            const actionToRun = { ...step.action, id: tempId };
            const res = await executeSingleAction(actionToRun as AgentAction, profile);
            results.push(res);
            if (!res.success) {
              sendResponse({
                success: false,
                stepIndex: i,
                failedStep: step,
                error: res.error,
                results,
              });
              return;
            }
          } else {
            sendResponse({
              success: false,
              layoutDrift: true,
              stepIndex: i,
              failedStep: step,
              error: `Element for step ${i + 1} ("${step.label || step.selector}") could not be found`,
              results,
            });
            return;
          }
          await new Promise((r) => setTimeout(r, 150));
        }

        sendResponse({ success: true, results });
      })().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        sendResponse({ success: false, error: message });
      });

      return true;
    }

    default:
      return false;
  }
});

}
