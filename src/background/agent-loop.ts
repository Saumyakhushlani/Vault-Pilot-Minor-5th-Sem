import { sendToModel } from '../shared/gateway';
import { evaluateActionSafety, isDomainAllowed } from '../shared/safety-gate';
import { getProfile, SETTINGS_STORAGE_KEY } from '../shared/vault';
import {
  ActionSafetyEvaluation,
  AgentAction,
  AgentResponse,
  AgentRunState,
  AskUserAction,
  ExtensionSettings,
  LogItem,
  ScannedElement,
  ScanResult,
  UserProfile,
  WorkflowRecordedStep,
} from '../shared/types';

export type EventCallback = (eventType: string, data: unknown) => void;

export class AgentLoop {
  private abortController: AbortController | null = null;
  private isRunning = false;
  private isPaused = false;
  private currentStep = 0;
  private maxSteps = 15;
  private currentCommand = '';
  private recordedSteps: WorkflowRecordedStep[] = [];
  private onEvent: EventCallback;
  private pendingConfirmationResolver: ((approved: boolean) => void) | null = null;
  private pendingQuestionResolver: ((answer: string) => void) | null = null;
  private logs: LogItem[] = [];

  constructor(onEvent: EventCallback) {
    this.onEvent = onEvent;
  }

  public getStatus(): AgentRunState {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      currentStep: this.currentStep,
      maxSteps: this.maxSteps,
      command: this.currentCommand,
      logs: [...this.logs],
    };
  }

  private addLog(type: LogItem['type'], text: string, metadata?: Record<string, unknown>): void {
    const logItem: LogItem = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      type,
      text,
      metadata,
    };
    this.logs.push(logItem);
    this.onEvent('LOG_ADDED', logItem);
  }

  public stop(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isRunning = false;
    this.isPaused = false;

    if (this.pendingConfirmationResolver) {
      this.pendingConfirmationResolver(false);
      this.pendingConfirmationResolver = null;
    }
    if (this.pendingQuestionResolver) {
      this.pendingQuestionResolver('');
      this.pendingQuestionResolver = null;
    }

    this.addLog('warning', 'Agent execution stopped by user.');
    this.onEvent('STATUS_UPDATE', this.getStatus());
  }

  public handleUserConfirmation(approved: boolean): void {
    if (this.pendingConfirmationResolver) {
      this.isPaused = false;
      this.pendingConfirmationResolver(approved);
      this.pendingConfirmationResolver = null;
      this.addLog(
        approved ? 'info' : 'warning',
        approved ? 'Action confirmed by user.' : 'Action rejected by user.'
      );
      this.onEvent('STATUS_UPDATE', this.getStatus());
    }
  }

  public handleUserAnswer(answer: string): void {
    if (this.pendingQuestionResolver) {
      this.isPaused = false;
      this.pendingQuestionResolver(answer);
      this.pendingQuestionResolver = null;
      this.addLog('user', `User answered: "${answer}"`);
      this.onEvent('STATUS_UPDATE', this.getStatus());
    }
  }

  public getRecordedSteps(): WorkflowRecordedStep[] {
    return [...this.recordedSteps];
  }

  public async start(command: string, tabId: number): Promise<void> {
    if (this.isRunning) {
      throw new Error('An automation task is already running.');
    }

    this.isRunning = true;
    this.isPaused = false;
    this.currentStep = 0;
    this.currentCommand = command;
    this.recordedSteps = [];
    this.abortController = new AbortController();

    this.addLog('info', `Starting task: "${command}"`);
    this.onEvent('STATUS_UPDATE', this.getStatus());

    try {
      const settings = await this.loadSettings();
      this.maxSteps = settings.maxSteps || 15;

      if (!settings.geminiApiKey) {
        throw new Error('Gemini API key is not configured. Please enter your key in Settings.');
      }

      const userProfile: UserProfile = await getProfile();

      while (this.currentStep < this.maxSteps && this.isRunning) {
        if (this.abortController?.signal.aborted) {
          break;
        }

        this.currentStep++;
        this.addLog('info', `Step ${this.currentStep} of ${this.maxSteps}...`);
        this.onEvent('STATUS_UPDATE', this.getStatus());

        const scanResult = await this.scanTab(tabId);
        if (!scanResult || !scanResult.elements) {
          throw new Error('Unable to scan active webpage. Please refresh the page and try again.');
        }

        if (!isDomainAllowed(scanResult.url, settings.domainAllowList)) {
          throw new Error(
            `Domain "${scanResult.domain}" is not in your allow-list. Add it in Settings to allow automation.`
          );
        }

        const elementsMap = new Map<number, ScannedElement>(
          scanResult.elements.map((el) => [el.id, el])
        );

        this.addLog('info', 'Analyzing page with Gemini (PII Shield active)...');
        let currentThoughtText = '';

        const modelResponse: AgentResponse = await sendToModel(
          {
            command: this.currentCommand,
            pageTitle: scanResult.title,
            pageUrl: scanResult.url,
            elements: scanResult.elements,
          },
          { feature: 'agent_loop' },
          {
            apiKey: settings.geminiApiKey,
            modelName: settings.modelName,
            signal: this.abortController.signal,
          },
          (token: string) => {
            currentThoughtText += token;
            this.onEvent('STREAM_CHUNK', { token, currentThought: currentThoughtText });
          }
        );

        this.addLog('thought', modelResponse.thought);
        this.onEvent('STEP_THOUGHT', { thought: modelResponse.thought });

        if (!modelResponse.actions || modelResponse.actions.length === 0) {
          if (modelResponse.status === 'done') {
            this.addLog('success', 'Task marked as completed by model.');
            break;
          }
          this.addLog('warning', 'Model planned no actions. Halting loop.');
          break;
        }

        for (const action of modelResponse.actions) {
          if (this.abortController?.signal.aborted || !this.isRunning) {
            break;
          }

          if (action.type === 'ask_user') {
            await this.promptUserQuestion(action);
            continue;
          }

          const safetyEval: ActionSafetyEvaluation = evaluateActionSafety(
            action,
            elementsMap,
            settings
          );

          if (safetyEval.requiresApproval) {
            if ('id' in action) {
              await this.highlightTabElement(tabId, action.id);
            }

            const approved = await this.requestUserApproval(safetyEval);
            await this.clearTabHighlights(tabId);

            if (!approved) {
              this.addLog('warning', `Action skipped by user.`);
              continue;
            }
          }

          if (settings.dryRun) {
            this.addLog('info', `[Dry Run] Would execute: ${JSON.stringify(action)}`);
            continue;
          }

          this.addLog('action', `Executing: ${action.type}${('id' in action) ? ` on element #${action.id}` : ''}`);
          const execRes = await this.executeActionOnTab(tabId, action, userProfile);

          if (!execRes.success) {
            this.addLog('error', `Action failed: ${execRes.error || 'Unknown execution failure'}`);
            break;
          }

          const targetEl = 'id' in action ? elementsMap.get(action.id) : undefined;
          this.recordedSteps.push({
            action,
            selector: targetEl?.selector,
            label: targetEl?.label,
            tag: targetEl?.tag,
            value: ('value' in action) ? action.value : undefined,
          });
        }

        if (modelResponse.status === 'done') {
          this.addLog('success', 'Automation completed successfully!');
          break;
        }

        if (modelResponse.status === 'blocked') {
          this.addLog('warning', 'Automation is blocked and waiting for user.');
          break;
        }

        await new Promise((r) => setTimeout(r, 600));
      }

      if (this.currentStep >= this.maxSteps) {
        this.addLog('warning', `Reached maximum step safety limit (${this.maxSteps} steps).`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.addLog('error', `Agent error: ${message}`);
      this.onEvent('RUN_ERROR', { error: message });
    } finally {
      this.isRunning = false;
      this.isPaused = false;
      this.abortController = null;
      this.onEvent('RUN_COMPLETED', {
        stepsCount: this.currentStep,
        recordedSteps: this.recordedSteps,
      });
      this.onEvent('STATUS_UPDATE', this.getStatus());
    }
  }

  private async loadSettings(): Promise<ExtensionSettings> {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const res = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
      const saved = res[SETTINGS_STORAGE_KEY] || {};
      return {
        geminiApiKey: saved.geminiApiKey || '',
        modelName: saved.modelName || 'gemini-1.5-flash',
        executionMode: saved.executionMode || 'autopilot',
        dryRun: Boolean(saved.dryRun),
        maxSteps: saved.maxSteps || 15,
        domainAllowList: saved.domainAllowList || [],
        language: saved.language || 'en',
      };
    }
    return {
      geminiApiKey: '',
      modelName: 'gemini-1.5-flash',
      executionMode: 'autopilot',
      dryRun: false,
      maxSteps: 15,
      domainAllowList: [],
      language: 'en',
    };
  }

  private async ensureContentScriptInjected(tabId: number): Promise<void> {
    const isResponsive = await new Promise<boolean>((resolve) => {
      chrome.tabs.sendMessage(tabId, { type: 'PING' }, (response) => {
        if (chrome.runtime.lastError || !response?.success) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });

    if (isResponsive) {
      return;
    }

    let tab: chrome.tabs.Tab | null = null;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch {
      // Tab might not be accessible
    }

    const url = tab?.url || '';

    if (
      url.startsWith('chrome://') ||
      url.startsWith('chrome-extension://') ||
      url.startsWith('edge://') ||
      url.startsWith('about:') ||
      url.startsWith('view-source:')
    ) {
      throw new Error(
        'VaultPilot cannot automate internal browser pages (chrome://). Please navigate to an actual form or application portal.'
      );
    }

    if (url.startsWith('file://')) {
      const isAllowed = await new Promise<boolean>((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.extension?.isAllowedFileSchemeAccess) {
          chrome.extension.isAllowedFileSchemeAccess((allowed) => resolve(allowed));
        } else {
          resolve(true);
        }
      });

      if (!isAllowed) {
        throw new Error(
          'Chrome is blocking access to local file URLs. To allow testing on local HTML files: Go to chrome://extensions -> Click "Details" on VaultPilot -> Turn ON "Allow access to file URLs" -> Refresh this tab (F5).'
        );
      }
    }

    try {
      const manifest = chrome.runtime.getManifest();
      const contentScripts = manifest.content_scripts?.[0]?.js || [];
      if (contentScripts.length > 0 && typeof chrome !== 'undefined' && chrome.scripting?.executeScript) {
        await chrome.scripting.executeScript({
          target: { tabId, allFrames: true },
          files: contentScripts,
        });
        await new Promise((r) => setTimeout(r, 150));
      }
    } catch (err: unknown) {
      console.warn('[VaultPilot] Script injection attempt:', err);
      throw new Error(
        'Could not connect to the webpage. Please refresh this page (press F5 or click reload) and try again.'
      );
    }
  }

  private async scanTab(tabId: number): Promise<ScanResult> {
    await this.ensureContentScriptInjected(tabId);

    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { type: 'SCAN_PAGE' }, (response) => {
        if (chrome.runtime.lastError) {
          const raw = chrome.runtime.lastError.message || '';
          if (raw.includes('Receiving end does not exist') || raw.includes('Could not establish connection')) {
            reject(
              new Error(
                'Could not connect to the webpage. Please refresh this page (press F5 or click reload) and try again.'
              )
            );
          } else {
            reject(new Error(raw));
          }
        } else if (response?.success) {
          resolve(response.data);
        } else {
          reject(new Error(response?.error || 'Failed to scan active tab.'));
        }
      });
    });
  }

  private async highlightTabElement(tabId: number, elementId: number): Promise<void> {
    try {
      chrome.tabs.sendMessage(tabId, { type: 'HIGHLIGHT_ELEMENT', id: elementId }, () => {});
    } catch {
      // Ignore
    }
  }

  private async clearTabHighlights(tabId: number): Promise<void> {
    try {
      chrome.tabs.sendMessage(tabId, { type: 'CLEAR_HIGHLIGHTS' }, () => {});
    } catch {
      // Ignore
    }
  }

  private async executeActionOnTab(
    tabId: number,
    action: AgentAction,
    profile: UserProfile
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tabId,
        {
          type: 'EXECUTE_ACTIONS',
          actions: [action],
          profile,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            const raw = chrome.runtime.lastError.message || '';
            const friendly = (raw.includes('Receiving end does not exist') || raw.includes('Could not establish connection'))
              ? 'Webpage connection was lost. Please refresh the page (F5) and try again.'
              : raw;
            resolve({ success: false, error: friendly });
          } else if (response?.success && response.results?.[0]?.success) {
            resolve({ success: true });
          } else {
            resolve({
              success: false,
              error: response?.results?.[0]?.error || response?.error || 'Action execution failed',
            });
          }
        }
      );
    });
  }

  private requestUserApproval(evaluation: ActionSafetyEvaluation): Promise<boolean> {
    this.isPaused = true;
    this.addLog(
      'warning',
      `Action requires confirmation: ${evaluation.reason || evaluation.action.type}`
    );
    this.onEvent('REQUIRE_CONFIRMATION', evaluation);
    this.onEvent('STATUS_UPDATE', this.getStatus());

    return new Promise((resolve) => {
      this.pendingConfirmationResolver = resolve;
    });
  }

  private promptUserQuestion(action: AskUserAction): Promise<string> {
    this.isPaused = true;
    this.addLog('info', `Agent asks: "${action.question}"`);
    this.onEvent('ASK_USER', action);
    this.onEvent('STATUS_UPDATE', this.getStatus());

    return new Promise((resolve) => {
      this.pendingQuestionResolver = (answer) => {
        this.currentCommand += `\nUser clarified: "${answer}"`;
        resolve(answer);
      };
    });
  }
}
