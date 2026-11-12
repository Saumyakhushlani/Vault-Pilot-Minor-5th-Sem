/**
 * VaultPilot - Side Panel UI Controller
 * Manages tabs, chat input, streaming thoughts, safety gate confirmation dialogs,
 * Profile Vault operations (save/export/wipe), workflows replay, and settings.
 */

import {
  ActionSafetyEvaluation,
  AgentRunState,
  AskUserAction,
  AuditLogEntry,
  ExtensionSettings,
  LogItem,
  UserProfile,
  WorkflowRecordedStep,
} from '../shared/types';
import {
  getProfile,
  saveProfile,
  exportAllData,
  wipeAllData,
  listPortalCredentials,
  deletePortalCredential,
  SETTINGS_STORAGE_KEY,
  AUDIT_STORAGE_KEY,
} from '../shared/vault';
import { setupAllCustomControls } from './custom-components';
import {
  getSavedWorkflows,
  saveWorkflow,
  deleteWorkflow,
  getPromptTemplates,
} from '../shared/workflow-manager';

// DOM Elements
const statusBadge = document.getElementById('status-badge') as HTMLElement;
const btnStop = document.getElementById('btn-emergency-stop') as HTMLButtonElement;
const modeSelect = document.getElementById('mode-select') as HTMLSelectElement;
const stepCounter = document.getElementById('step-counter') as HTMLElement;

// Tabs
const tabButtons = document.querySelectorAll<HTMLButtonElement>('.tab-btn');
const tabContents = document.querySelectorAll<HTMLElement>('.tab-content');

// Onboarding Banner
const onboardingBanner = document.getElementById('onboarding-banner') as HTMLElement | null;
const bannerTitle = document.getElementById('banner-title') as HTMLElement | null;
const bannerDesc = document.getElementById('banner-desc') as HTMLElement | null;
const btnBannerSettings = document.getElementById('btn-banner-settings') as HTMLButtonElement | null;
const btnBannerVault = document.getElementById('btn-banner-vault') as HTMLButtonElement | null;

// Chat Tab Elements
const btnAutofillHero = document.getElementById('btn-autofill-current-page') as HTMLButtonElement | null;
const commandForm = document.getElementById('command-form') as HTMLFormElement;
const commandInput = document.getElementById('command-input') as HTMLTextAreaElement;
const btnMic = document.getElementById('btn-mic') as HTMLButtonElement;
const thoughtContainer = document.getElementById('thought-container') as HTMLElement;
const thoughtText = document.getElementById('thought-text') as HTMLElement;
const confirmationCard = document.getElementById('confirmation-card') as HTMLElement;
const confirmationReason = document.getElementById('confirmation-reason') as HTMLElement;
const confirmationMeta = document.getElementById('confirmation-meta') as HTMLElement;
const btnConfirmYes = document.getElementById('btn-confirm-yes') as HTMLButtonElement;
const btnConfirmNo = document.getElementById('btn-confirm-no') as HTMLButtonElement;
const questionCard = document.getElementById('question-card') as HTMLElement;
const questionText = document.getElementById('question-text') as HTMLElement;
const questionOptions = document.getElementById('question-options') as HTMLElement;
const questionInput = document.getElementById('question-input') as HTMLInputElement;
const btnSubmitAnswer = document.getElementById('btn-submit-answer') as HTMLButtonElement;
const logList = document.getElementById('log-list') as HTMLElement;
const btnClearLogs = document.getElementById('btn-clear-logs') as HTMLButtonElement;
const btnSaveWorkflow = document.getElementById('btn-save-as-workflow') as HTMLButtonElement;
const pinnedTemplatesList = document.getElementById('pinned-templates-list') as HTMLElement;

// Workflows Tab Elements
const workflowsList = document.getElementById('workflows-list') as HTMLElement;
const allTemplatesList = document.getElementById('all-templates-list') as HTMLElement;

// Vault Tab Elements
const vaultForm = document.getElementById('vault-form') as HTMLFormElement;
const btnFillDemoVault = document.getElementById('btn-fill-demo-vault') as HTMLButtonElement | null;
const btnExportData = document.getElementById('btn-export-data') as HTMLButtonElement;
const btnWipeData = document.getElementById('btn-wipe-data') as HTMLButtonElement;

// Settings Tab Elements
const settingsForm = document.getElementById('settings-form') as HTMLFormElement;
const sApiKey = document.getElementById('s-apikey') as HTMLInputElement;
const btnToggleApiKey = document.getElementById('btn-toggle-apikey') as HTMLButtonElement;
const btnTestApiKey = document.getElementById('btn-test-apikey') as HTMLButtonElement | null;
const sModel = document.getElementById('s-model') as HTMLSelectElement;
const sDryRun = document.getElementById('s-dryrun') as HTMLInputElement;
const sMaxSteps = document.getElementById('s-maxsteps') as HTMLInputElement;
const sAllowList = document.getElementById('s-allowlist') as HTMLTextAreaElement;
const sLang = document.getElementById('s-lang') as HTMLSelectElement;
const auditLogView = document.getElementById('audit-log-view') as HTMLElement;

// Custom UI Controls Controller
let customControls: { syncAll: () => void; syncDob: () => void } | null = null;

// Runtime Port Connection
let port: chrome.runtime.Port | null = null;
let lastRecordedSteps: WorkflowRecordedStep[] = [];
let recognition: unknown = null;

function connectPort(): void {
  try {
    port = chrome.runtime.connect({ name: 'vaultpilot-sidepanel' });

    port.onMessage.addListener((msg: { type: string; data?: unknown }) => {
      handleIncomingEvent(msg.type, msg.data);
    });

    port.onDisconnect.addListener(() => {
      console.warn('[VaultPilot] Port disconnected. Reconnecting...');
      setTimeout(connectPort, 1000);
    });
  } catch (err) {
    console.error('[VaultPilot] Port connection failed:', err);
  }
}

connectPort();

// ==========================================
// 1. Event Handling from Background
// ==========================================

function handleIncomingEvent(type: string, data: unknown): void {
  switch (type) {
    case 'STATUS_UPDATE': {
      const state = data as AgentRunState;
      updateUIStatus(state);
      break;
    }

    case 'STREAM_CHUNK': {
      const chunkData = data as { token: string; currentThought: string };
      thoughtContainer.style.display = 'block';
      thoughtText.textContent = chunkData.currentThought;
      break;
    }

    case 'STEP_THOUGHT': {
      const thoughtData = data as { thought: string };
      thoughtContainer.style.display = 'block';
      thoughtText.textContent = thoughtData.thought;
      break;
    }

    case 'REQUIRE_CONFIRMATION': {
      const evaluation = data as ActionSafetyEvaluation;
      showConfirmationDialog(evaluation);
      break;
    }

    case 'ASK_USER': {
      const action = data as AskUserAction;
      showQuestionDialog(action);
      break;
    }

    case 'LOG_ADDED': {
      const item = data as LogItem;
      appendLog(item);
      break;
    }

    case 'RUN_COMPLETED': {
      const res = data as { stepsCount: number; recordedSteps: WorkflowRecordedStep[] };
      lastRecordedSteps = res.recordedSteps || [];
      if (lastRecordedSteps.length > 0) {
        btnSaveWorkflow.style.display = 'inline-flex';
      }
      break;
    }

    case 'RUN_ERROR': {
      thoughtContainer.style.display = 'none';
      break;
    }
  }
}

function updateUIStatus(state: AgentRunState): void {
  if (state.isRunning) {
    if (state.isPaused) {
      statusBadge.textContent = 'Action Paused';
      statusBadge.className = 'badge badge-paused';
    } else {
      statusBadge.textContent = 'Running';
      statusBadge.className = 'badge badge-running';
    }
    btnStop.style.display = 'inline-flex';
  } else {
    statusBadge.textContent = 'Ready';
    statusBadge.className = 'badge badge-idle';
    btnStop.style.display = 'none';
    thoughtContainer.style.display = 'none';
    confirmationCard.style.display = 'none';
    questionCard.style.display = 'none';
  }

  stepCounter.textContent = `${state.currentStep}/${state.maxSteps} steps`;
}

function appendLog(item: LogItem): void {
  const empty = logList.querySelector('.log-empty');
  if (empty) {
    empty.remove();
  }

  const div = document.createElement('div');
  div.className = `log-item ${item.type}`;

  const time = new Date(item.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  div.innerHTML = `<span style="opacity:0.6;">[${time}]</span> <span>${escapeHtml(item.text)}</span>`;
  logList.appendChild(div);
  logList.scrollTop = logList.scrollHeight;
}

function showConfirmationDialog(evaluation: ActionSafetyEvaluation): void {
  confirmationCard.style.display = 'block';
  confirmationReason.textContent =
    evaluation.reason ||
    `Action "${evaluation.action.type}" requires your review before execution.`;

  confirmationMeta.textContent = evaluation.elementLabel
    ? `Target element: "${evaluation.elementLabel}" (${evaluation.elementTag || ''})`
    : `Target: Action #${('id' in evaluation.action) ? evaluation.action.id : ''}`;

  confirmationCard.scrollIntoView({ behavior: 'smooth' });
}

function showQuestionDialog(action: AskUserAction): void {
  questionCard.style.display = 'block';
  questionText.textContent = action.question;
  questionOptions.innerHTML = '';
  questionInput.value = '';

  if (action.options && action.options.length > 0) {
    for (const opt of action.options) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'option-chip';
      chip.textContent = opt;
      chip.addEventListener('click', () => {
        submitUserAnswer(opt);
      });
      questionOptions.appendChild(chip);
    }
  }

  questionCard.scrollIntoView({ behavior: 'smooth' });
  questionInput.focus();
}

function submitUserAnswer(answer: string): void {
  if (!answer.trim()) return;
  chrome.runtime.sendMessage({ type: 'ANSWER_USER_QUESTION', answer: answer.trim() });
  questionCard.style.display = 'none';
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==========================================
// 2. Tab Navigation & Onboarding Status
// ==========================================

function switchTab(targetTabId: string): void {
  tabButtons.forEach((b) => b.classList.remove('active'));
  tabContents.forEach((c) => c.classList.remove('active'));

  const activeBtn = document.querySelector<HTMLButtonElement>(`[data-tab="${targetTabId}"]`);
  const activeContent = document.getElementById(targetTabId);

  activeBtn?.classList.add('active');
  activeContent?.classList.add('active');

  if (targetTabId === 'tab-workflows') {
    renderWorkflowsTab();
  } else if (targetTabId === 'tab-settings') {
    renderAuditLogs();
  } else if (targetTabId === 'tab-vault') {
    renderPortalCredentials();
  }
}

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const targetTabId = btn.getAttribute('data-tab');
    if (targetTabId) {
      switchTab(targetTabId);
    }
  });
});

async function checkOnboardingStatus(): Promise<void> {
  if (!onboardingBanner) return;
  const settings = await loadSettingsFromStorage();
  const profile = await getProfile();

  const hasKey = Boolean(settings.geminiApiKey && settings.geminiApiKey.trim());
  const hasProfile = Boolean(profile.fullName && profile.fullName.trim());

  if (!hasKey) {
    onboardingBanner.style.display = 'flex';
    if (bannerTitle) bannerTitle.textContent = 'Step 1: Set Your Gemini API Key';
    if (bannerDesc) bannerDesc.textContent = 'Add your free Google Gemini API key in Settings to activate form filling.';
  } else if (!hasProfile) {
    onboardingBanner.style.display = 'flex';
    if (bannerTitle) bannerTitle.textContent = 'Step 2: Save Your Details in Profile Vault';
    if (bannerDesc) bannerDesc.textContent = 'Enter your details once in Profile Vault so VaultPilot can autofill any form.';
  } else {
    onboardingBanner.style.display = 'none';
  }
}

if (btnBannerSettings) {
  btnBannerSettings.addEventListener('click', () => switchTab('tab-settings'));
}

if (btnBannerVault) {
  btnBannerVault.addEventListener('click', () => switchTab('tab-vault'));
}

// ==========================================
// 3. User Controls & Form Submissions
// ==========================================

function triggerCommandRun(command: string): void {
  if (!command.trim()) return;

  btnSaveWorkflow.style.display = 'none';
  chrome.runtime.sendMessage({ type: 'START_RUN', command: command.trim() }, (res) => {
    if (!res?.success) {
      appendLog({
        id: `err_${Date.now()}`,
        timestamp: Date.now(),
        type: 'error',
        text: res?.error || 'Failed to start run.',
      });
    }
  });
}

// 1-Click Hero Autofill Button
if (btnAutofillHero) {
  btnAutofillHero.addEventListener('click', () => {
    const defaultCommand = 'Fill this application form using my saved profile';
    commandInput.value = defaultCommand;
    triggerCommandRun(defaultCommand);
  });
}

commandForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const command = commandInput.value.trim();
  if (!command) return;

  triggerCommandRun(command);
  commandInput.value = '';
});

btnStop.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'STOP_RUN' });
});

btnConfirmYes.addEventListener('click', () => {
  confirmationCard.style.display = 'none';
  chrome.runtime.sendMessage({ type: 'CONFIRM_ACTION', approved: true });
});

btnConfirmNo.addEventListener('click', () => {
  confirmationCard.style.display = 'none';
  chrome.runtime.sendMessage({ type: 'CONFIRM_ACTION', approved: false });
});

btnSubmitAnswer.addEventListener('click', () => {
  submitUserAnswer(questionInput.value);
});

questionInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    submitUserAnswer(questionInput.value);
  }
});

btnClearLogs.addEventListener('click', () => {
  logList.innerHTML = '<div class="log-empty">Activity log cleared.</div>';
});

// Execution mode toggle
modeSelect.addEventListener('change', async () => {
  const mode = modeSelect.value as 'autopilot' | 'step-by-step';
  const settings = await loadSettingsFromStorage();
  settings.executionMode = mode;
  await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings });
  appendLog({
    id: `m_${Date.now()}`,
    timestamp: Date.now(),
    type: 'info',
    text: `Switched execution mode to ${mode === 'autopilot' ? 'Smart Autopilot' : 'Step-by-Step'}.`,
  });
});

// Speech Recognition for Voice Commands
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechRec = (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any }).SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition;

  recognition = new SpeechRec();
  const r = recognition as any;
  r.continuous = false;
  r.interimResults = false;
  r.lang = 'en-IN';

  r.onresult = (event: any) => {
    const transcript = event.results[0][0].transcript;
    commandInput.value = transcript;
    btnMic.classList.remove('active');
  };

  r.onerror = () => {
    btnMic.classList.remove('active');
  };

  r.onend = () => {
    btnMic.classList.remove('active');
  };

  btnMic.addEventListener('click', () => {
    try {
      btnMic.classList.add('active');
      r.start();
    } catch {
      r.stop();
      btnMic.classList.remove('active');
    }
  });
} else {
  btnMic.style.display = 'none';
}

// ==========================================
// 4. Workflows & Prompt Templates
// ==========================================

btnSaveWorkflow.addEventListener('click', async () => {
  if (lastRecordedSteps.length === 0) return;

  const name = prompt('Enter a name for this workflow (e.g. Scholarship Application Form):');
  if (!name) return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const domain = tab?.url ? new URL(tab.url).hostname : 'current-site';
  const urlPattern = tab?.url || '';

  await saveWorkflow(name, domain, urlPattern, lastRecordedSteps);
  alert(`Workflow "${name}" saved! You can replay it anytime from the Workflows tab.`);
  btnSaveWorkflow.style.display = 'none';
});

async function renderWorkflowsTab(): Promise<void> {
  const workflows = await getSavedWorkflows();
  workflowsList.innerHTML = '';

  if (workflows.length === 0) {
    workflowsList.innerHTML =
      '<div class="empty-state">No saved workflows yet. Complete a form run and click "Save Workflow".</div>';
  } else {
    for (const wf of workflows) {
      const card = document.createElement('div');
      card.className = 'workflow-card';
      card.innerHTML = `
        <div class="wf-header">
          <span class="wf-title font-medium">${escapeHtml(wf.name)}</span>
          <div class="wf-actions">
            <button class="btn btn-primary btn-xs btn-replay" data-id="${wf.id}">
              <svg class="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Replay
            </button>
            <button class="btn btn-danger-outline btn-xs btn-delete" data-id="${wf.id}">
              <svg class="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              Delete
            </button>
          </div>
        </div>
        <div class="wf-meta">${escapeHtml(wf.domain)} • ${wf.steps.length} steps</div>
      `;
      workflowsList.appendChild(card);
    }

    workflowsList.querySelectorAll<HTMLButtonElement>('.btn-replay').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-id');
        if (id) {
          switchTab('tab-chat');
          chrome.runtime.sendMessage({ type: 'REPLAY_WORKFLOW', workflowId: id });
        }
      });
    });

    workflowsList.querySelectorAll<HTMLButtonElement>('.btn-delete').forEach((b) => {
      b.addEventListener('click', async () => {
        const id = b.getAttribute('data-id');
        if (id && confirm('Delete this workflow?')) {
          await deleteWorkflow(id);
          renderWorkflowsTab();
        }
      });
    });
  }

  // Render Prompt Templates
  const templates = await getPromptTemplates();
  allTemplatesList.innerHTML = '';

  for (const t of templates) {
    const card = document.createElement('div');
    card.className = 'template-card';
    card.innerHTML = `
      <div class="wf-header">
        <span class="wf-title font-medium">${escapeHtml(t.title)}</span>
        <button class="btn btn-outline btn-xs btn-use-template" data-prompt="${escapeHtml(t.prompt)}">
          <svg class="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg>
          Use
        </button>
      </div>
      <div class="wf-meta">${escapeHtml(t.prompt)}</div>
    `;
    allTemplatesList.appendChild(card);
  }

  allTemplatesList.querySelectorAll<HTMLButtonElement>('.btn-use-template').forEach((b) => {
    b.addEventListener('click', () => {
      const p = b.getAttribute('data-prompt');
      if (p) {
        commandInput.value = p;
        switchTab('tab-chat');
        commandInput.focus();
      }
    });
  });
}

// Render Pinned Templates in Chat
async function renderPinnedTemplates(): Promise<void> {
  const templates = await getPromptTemplates();
  const pinned = templates.filter((t) => t.pinned);
  pinnedTemplatesList.innerHTML = '';

  for (const t of pinned) {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'template-pill';
    pill.textContent = t.title;
    pill.title = t.prompt;
    pill.addEventListener('click', () => {
      commandInput.value = t.prompt;
      commandInput.focus();
    });
    pinnedTemplatesList.appendChild(pill);
  }
}

// ==========================================
// 5. Profile Vault Management
// ==========================================


async function renderPortalCredentials(): Promise<void> {
  const container = document.getElementById('portal-credentials-list');
  if (!container) return;

  const creds = await listPortalCredentials();
  if (creds.length === 0) {
    container.innerHTML = '<div class="text-xs text-muted" style="color: #64748b; font-size: 11px;">No portal logins saved yet. Use chat (e.g. "my id is ... and pass is ...") to save automatically.</div>';
    return;
  }

  container.innerHTML = '';
  for (const c of creds) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.padding = '6px 10px';
    row.style.backgroundColor = '#ffffff';
    row.style.borderRadius = '6px';
    row.style.border = '1px solid #e2e8f0';

    const info = document.createElement('div');
    info.style.display = 'flex';
    info.style.flexDirection = 'column';
    info.style.gap = '2px';

    const domainSpan = document.createElement('span');
    domainSpan.style.fontWeight = '600';
    domainSpan.style.fontSize = '12px';
    domainSpan.style.color = '#1e293b';
    domainSpan.textContent = c.domain;

    const userSpan = document.createElement('span');
    userSpan.style.fontSize = '11px';
    userSpan.style.color = '#64748b';
    userSpan.textContent = `User: ${c.username} • Pass: ••••••••`;

    info.appendChild(domainSpan);
    info.appendChild(userSpan);

    const btnDelete = document.createElement('button');
    btnDelete.type = 'button';
    btnDelete.className = 'btn btn-text btn-xs';
    btnDelete.style.color = '#ef4444';
    btnDelete.style.padding = '4px 6px';
    btnDelete.textContent = 'Remove';
    btnDelete.addEventListener('click', async () => {
      await deletePortalCredential(c.domain);
      await renderPortalCredentials();
    });

    row.appendChild(info);
    row.appendChild(btnDelete);
    container.appendChild(row);
  }
}

async function loadProfileIntoForm(): Promise<void> {
  const p = await getProfile();
  (document.getElementById('v-fullname') as HTMLInputElement).value = p.fullName || '';
  (document.getElementById('v-dob') as HTMLInputElement).value = p.dob || '';
  (document.getElementById('v-gender') as HTMLSelectElement).value = p.gender || '';
  (document.getElementById('v-category') as HTMLSelectElement).value = p.category || '';
  (document.getElementById('v-father') as HTMLInputElement).value = p.fatherName || '';
  (document.getElementById('v-mother') as HTMLInputElement).value = p.motherName || '';
  (document.getElementById('v-email') as HTMLInputElement).value = p.email || '';
  (document.getElementById('v-phone') as HTMLInputElement).value = p.phone || '';
  (document.getElementById('v-address') as HTMLInputElement).value = p.address || '';
  (document.getElementById('v-city') as HTMLInputElement).value = p.city || '';
  (document.getElementById('v-state') as HTMLInputElement).value = p.state || '';
  (document.getElementById('v-pincode') as HTMLInputElement).value = p.pincode || '';
  (document.getElementById('v-college') as HTMLInputElement).value = p.collegeName || '';
  (document.getElementById('v-rollno') as HTMLInputElement).value = p.rollNo || '';
  (document.getElementById('v-degree') as HTMLInputElement).value = p.degree || '';
  (document.getElementById('v-branch') as HTMLInputElement).value = p.branch || '';
  (document.getElementById('v-cgpa') as HTMLInputElement).value = p.cgpa || '';
  (document.getElementById('v-aadhaar') as HTMLInputElement).value = p.aadhaar || '';
  (document.getElementById('v-pan') as HTMLInputElement).value = p.pan || '';
  customControls?.syncAll();
}

// 1-Click Fill Demo Profile
if (btnFillDemoVault) {
  btnFillDemoVault.addEventListener('click', () => {
    (document.getElementById('v-fullname') as HTMLInputElement).value = 'Saumya Khushlani';
    (document.getElementById('v-dob') as HTMLInputElement).value = '2004-05-15';
    (document.getElementById('v-gender') as HTMLSelectElement).value = 'Male';
    (document.getElementById('v-category') as HTMLSelectElement).value = 'General';
    (document.getElementById('v-father') as HTMLInputElement).value = 'Ramesh Khushlani';
    (document.getElementById('v-mother') as HTMLInputElement).value = 'Anita Khushlani';
    (document.getElementById('v-email') as HTMLInputElement).value = 'saumya@example.com';
    (document.getElementById('v-phone') as HTMLInputElement).value = '9876543210';
    (document.getElementById('v-address') as HTMLInputElement).value = 'MANIT Campus, Link Road No. 3';
    (document.getElementById('v-city') as HTMLInputElement).value = 'Bhopal';
    (document.getElementById('v-state') as HTMLInputElement).value = 'Madhya Pradesh';
    (document.getElementById('v-pincode') as HTMLInputElement).value = '462003';
    (document.getElementById('v-college') as HTMLInputElement).value = 'Maulana Azad National Institute of Technology Bhopal';
    (document.getElementById('v-rollno') as HTMLInputElement).value = '24112011148';
    (document.getElementById('v-degree') as HTMLInputElement).value = 'B.Tech';
    (document.getElementById('v-branch') as HTMLInputElement).value = 'Computer Science & Engineering';
    (document.getElementById('v-cgpa') as HTMLInputElement).value = '8.75';
    (document.getElementById('v-aadhaar') as HTMLInputElement).value = '234567890128';
    (document.getElementById('v-pan') as HTMLInputElement).value = 'ABCDE1234F';
    customControls?.syncAll();

    alert('Demo student profile loaded into form! Click "Save Profile" below to persist.');
  });
}

vaultForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const profile: UserProfile = {
    fullName: (document.getElementById('v-fullname') as HTMLInputElement).value.trim(),
    dob: (document.getElementById('v-dob') as HTMLInputElement).value,
    gender: (document.getElementById('v-gender') as HTMLSelectElement).value,
    category: (document.getElementById('v-category') as HTMLSelectElement).value,
    fatherName: (document.getElementById('v-father') as HTMLInputElement).value.trim(),
    motherName: (document.getElementById('v-mother') as HTMLInputElement).value.trim(),
    email: (document.getElementById('v-email') as HTMLInputElement).value.trim(),
    phone: (document.getElementById('v-phone') as HTMLInputElement).value.trim(),
    address: (document.getElementById('v-address') as HTMLInputElement).value.trim(),
    city: (document.getElementById('v-city') as HTMLInputElement).value.trim(),
    state: (document.getElementById('v-state') as HTMLInputElement).value.trim(),
    pincode: (document.getElementById('v-pincode') as HTMLInputElement).value.trim(),
    collegeName: (document.getElementById('v-college') as HTMLInputElement).value.trim(),
    rollNo: (document.getElementById('v-rollno') as HTMLInputElement).value.trim(),
    degree: (document.getElementById('v-degree') as HTMLInputElement).value.trim(),
    branch: (document.getElementById('v-branch') as HTMLInputElement).value.trim(),
    cgpa: (document.getElementById('v-cgpa') as HTMLInputElement).value.trim(),
    aadhaar: (document.getElementById('v-aadhaar') as HTMLInputElement).value.trim(),
    pan: (document.getElementById('v-pan') as HTMLInputElement).value.trim(),
  };

  await saveProfile(profile);
  await checkOnboardingStatus();
  alert('Profile Vault updated! Real personal details will be substituted directly at DOM execution time.');
});

btnExportData.addEventListener('click', async () => {
  const jsonStr = await exportAllData();
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vaultpilot-export-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

btnWipeData.addEventListener('click', async () => {
  if (confirm('Are you sure you want to wipe ALL stored data (profile, API keys, workflows)? This cannot be undone.')) {
    await wipeAllData();
    await loadProfileIntoForm();
renderPortalCredentials();
    await loadSettingsIntoForm();
    await checkOnboardingStatus();
    alert('All data has been completely erased from extension storage.');
  }
});

// ==========================================
// 6. Settings Management & Audit Logs
// ==========================================

async function loadSettingsFromStorage(): Promise<ExtensionSettings> {
  const res = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
  return res[SETTINGS_STORAGE_KEY] || {
    geminiApiKey: '',
    modelName: 'gemini-3.5-flash',
    executionMode: 'autopilot',
    dryRun: false,
    maxSteps: 15,
    domainAllowList: [],
    language: 'en',
  };
}

async function loadSettingsIntoForm(): Promise<void> {
  const s = await loadSettingsFromStorage();
  sApiKey.value = s.geminiApiKey || '';
  let modelVal = s.modelName || 'gemini-3.5-flash';
  if (modelVal.includes('2.0') || modelVal.includes('2.5') || modelVal === 'gemini-1.5-flash') {
    modelVal = 'gemini-3.5-flash';
  }
  sModel.value = modelVal;
  sDryRun.checked = Boolean(s.dryRun);
  sMaxSteps.value = String(s.maxSteps || 15);
  sAllowList.value = (s.domainAllowList || []).join('\n');
  sLang.value = s.language || 'en';
  modeSelect.value = s.executionMode || 'autopilot';
  customControls?.syncAll();
}

btnToggleApiKey.addEventListener('click', () => {
  if (sApiKey.type === 'password') {
    sApiKey.type = 'text';
    btnToggleApiKey.textContent = 'Hide';
  } else {
    sApiKey.type = 'password';
    btnToggleApiKey.textContent = 'Show';
  }
});

if (btnTestApiKey) {
  btnTestApiKey.addEventListener('click', () => {
    const apiKey = sApiKey.value.trim();
    if (!apiKey) {
      alert('Please enter your Gemini API key first.');
      sApiKey.focus();
      return;
    }

    btnTestApiKey.textContent = 'Testing...';
    chrome.runtime.sendMessage(
      {
        type: 'TEST_API_KEY',
        apiKey,
        modelName: sModel.value || 'gemini-3.8-flash',
      },
      (res) => {
        btnTestApiKey.textContent = 'Test Key';
        if (res?.success) {
          alert('API key test succeeded! Your Gemini key is valid and connected.');
        } else {
          alert(`API key test failed: ${res?.error || 'Unknown error'}`);
        }
      }
    );
  });
}

settingsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const settings: ExtensionSettings = {
    geminiApiKey: sApiKey.value.trim(),
    modelName: sModel.value,
    executionMode: modeSelect.value as 'autopilot' | 'step-by-step',
    dryRun: sDryRun.checked,
    maxSteps: parseInt(sMaxSteps.value, 10) || 15,
    domainAllowList: sAllowList.value
      .split('\n')
      .map((d) => d.trim())
      .filter(Boolean),
    language: sLang.value as 'en' | 'hi' | 'hinglish',
  };

  await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings });
  await checkOnboardingStatus();
  alert('Settings saved successfully!');
});

async function renderAuditLogs(): Promise<void> {
  const res = await chrome.storage.local.get(AUDIT_STORAGE_KEY);
  const logs: AuditLogEntry[] = res[AUDIT_STORAGE_KEY] || [];
  auditLogView.innerHTML = '';

  if (logs.length === 0) {
    auditLogView.innerHTML = '<div class="text-ink-muted text-xs text-center py-4">No PII was sent to the model yet.</div>';
    return;
  }

  const recent = logs.slice(-15).reverse();
  for (const entry of recent) {
    const div = document.createElement('div');
    div.className = 'audit-entry py-1 text-xs border-b border-border-subtle flex justify-between';
    const date = new Date(entry.timestamp).toLocaleTimeString();
    div.innerHTML = `
      <span class="text-ink-secondary">${date} [${escapeHtml(entry.feature)}]</span>
      <span class="text-emerald-600 font-medium">Masked: ${entry.maskedCount} item(s)</span>
    `;
    auditLogView.appendChild(div);
  }
}

// Initial Bootstrap
customControls = setupAllCustomControls();
loadProfileIntoForm();
loadSettingsIntoForm();
renderPinnedTemplates();
checkOnboardingStatus();
