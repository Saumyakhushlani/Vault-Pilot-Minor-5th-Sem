import { AgentLoop } from './agent-loop';
import { getProfile } from '../shared/vault';
import { getSavedWorkflows } from '../shared/workflow-manager';
import { Workflow, WorkflowRecordedStep } from '../shared/types';

if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
    console.warn('[VaultPilot] Failed to set sidePanel behavior:', err);
  });
}

const connectedPorts: chrome.runtime.Port[] = [];

function broadcastEvent(eventType: string, data: unknown): void {
  for (let i = connectedPorts.length - 1; i >= 0; i--) {
    try {
      connectedPorts[i].postMessage({ type: eventType, data });
    } catch {
      connectedPorts.splice(i, 1);
    }
  }
}

const agentLoop = new AgentLoop((eventType, data) => {
  broadcastEvent(eventType, data);
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'vaultpilot-sidepanel') {
    connectedPorts.push(port);

    port.postMessage({ type: 'STATUS_UPDATE', data: agentLoop.getStatus() });

    port.onDisconnect.addListener(() => {
      const index = connectedPorts.indexOf(port);
      if (index !== -1) {
        connectedPorts.splice(index, 1);
      }
    });

    port.onMessage.addListener(async (msg) => {
      await handleMessage(msg, (response) => {
        try {
          port.postMessage(response);
        } catch {
          // Port closed
        }
      });
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message, sendResponse);
  return true;
});

async function handleMessage(
  message: { type: string; [key: string]: unknown },
  sendResponse: (res: unknown) => void
): Promise<void> {
  if (!message || typeof message.type !== 'string') {
    return;
  }

  switch (message.type) {
    case 'START_RUN': {
      const command = (message.command as string) || '';
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab?.id) {
          sendResponse({ success: false, error: 'No active tab found. Please open a webpage.' });
          return;
        }

        agentLoop.start(command, activeTab.id).catch((err) => {
          console.error('[VaultPilot] Run failed:', err);
        });

        sendResponse({ success: true });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        sendResponse({ success: false, error: errorMsg });
      }
      break;
    }

    case 'STOP_RUN': {
      agentLoop.stop();
      sendResponse({ success: true });
      break;
    }

    case 'CONFIRM_ACTION': {
      const approved = Boolean(message.approved);
      agentLoop.handleUserConfirmation(approved);
      sendResponse({ success: true });
      break;
    }

    case 'ANSWER_USER_QUESTION': {
      const answer = (message.answer as string) || '';
      agentLoop.handleUserAnswer(answer);
      sendResponse({ success: true });
      break;
    }

    case 'GET_STATUS': {
      sendResponse({ success: true, data: agentLoop.getStatus() });
      break;
    }

    case 'GET_RECORDED_STEPS': {
      sendResponse({ success: true, data: agentLoop.getRecordedSteps() });
      break;
    }

    case 'REPLAY_WORKFLOW': {
      const workflowId = message.workflowId as string;
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab?.id) {
          sendResponse({ success: false, error: 'No active tab found.' });
          return;
        }

        const workflows = await getSavedWorkflows();
        const target = workflows.find((w: Workflow) => w.id === workflowId);
        if (!target) {
          sendResponse({ success: false, error: 'Workflow not found.' });
          return;
        }

        const profile = await getProfile();

        broadcastEvent('LOG_ADDED', {
          id: `log_${Date.now()}`,
          timestamp: Date.now(),
          type: 'info',
          text: `Replaying workflow: "${target.name}" (${target.steps.length} steps)...`,
        });

        chrome.tabs.sendMessage(
          activeTab.id,
          {
            type: 'REPLAY_WORKFLOW_STEPS',
            steps: target.steps,
            profile,
          },
          (res) => {
            if (chrome.runtime.lastError) {
              sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else if (res?.success) {
              broadcastEvent('LOG_ADDED', {
                id: `log_${Date.now()}`,
                timestamp: Date.now(),
                type: 'success',
                text: `Workflow "${target.name}" completed successfully in <2s!`,
              });
              sendResponse({ success: true });
            } else if (res?.layoutDrift) {
              broadcastEvent('LOG_ADDED', {
                id: `log_${Date.now()}`,
                timestamp: Date.now(),
                type: 'warning',
                text: `Layout change detected at step ${res.stepIndex + 1}. Initiating AI self-healing...`,
              });
              const healCommand = `Continue filling this form for "${target.name}". Element changed for: "${(res.failedStep as WorkflowRecordedStep)?.label || ''}"`;
              if (activeTab.id) {
                agentLoop.start(healCommand, activeTab.id).catch(console.error);
              }
              sendResponse({ success: true, healing: true });
            } else {
              sendResponse({ success: false, error: res?.error || 'Replay failed' });
            }
          }
        );
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        sendResponse({ success: false, error: errorMsg });
      }
      break;
    }

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }
}
