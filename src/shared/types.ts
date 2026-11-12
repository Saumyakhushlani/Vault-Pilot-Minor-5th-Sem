export interface ElementBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScannedElement {
  id: number;
  tag: string;
  type: string | null;
  label: string;
  placeholder?: string;
  value?: string;
  options?: string[];
  checked?: boolean;
  disabled?: boolean;
  role?: string;
  name?: string;
  location?: ElementBoundingBox;
  inShadowRoot?: boolean;
  inIframe?: boolean;
  selector?: string;
}

export interface ScanResult {
  url: string;
  title: string;
  domain: string;
  elements: ScannedElement[];
  accessibleFramesCount: number;
  inaccessibleFramesCount: number;
}

export type ActionType =
  | 'type'
  | 'click'
  | 'select'
  | 'check'
  | 'scroll'
  | 'wait'
  | 'ask_user';

export interface BaseAction {
  type: ActionType;
}

export interface TypeAction extends BaseAction {
  type: 'type';
  id: number;
  value: string;
}

export interface ClickAction extends BaseAction {
  type: 'click';
  id: number;
}

export interface SelectAction extends BaseAction {
  type: 'select';
  id: number;
  value: string;
}

export interface CheckAction extends BaseAction {
  type: 'check';
  id: number;
  checked: boolean;
}

export interface ScrollAction extends BaseAction {
  type: 'scroll';
  direction?: 'up' | 'down';
  amount?: number;
}

export interface WaitAction extends BaseAction {
  type: 'wait';
  durationMs?: number;
}

export interface AskUserAction extends BaseAction {
  type: 'ask_user';
  question: string;
  options?: string[];
}

export type AgentAction =
  | TypeAction
  | ClickAction
  | SelectAction
  | CheckAction
  | ScrollAction
  | WaitAction
  | AskUserAction;

export type RunStatus = 'continue' | 'done' | 'blocked';

export interface AgentResponse {
  thought: string;
  actions: AgentAction[];
  status: RunStatus;
}

export type PIICategory =
  | 'AADHAAR'
  | 'PAN'
  | 'CARD'
  | 'CVV'
  | 'OTP'
  | 'PASSWORD'
  | 'MOBILE'
  | 'MASKED';

export interface MaskStats {
  totalMasked: number;
  byCategory: Record<PIICategory, number>;
}

export interface MaskResult<T> {
  payload: T;
  stats: MaskStats;
}

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  feature: string;
  maskedCount: number;
  byCategory: Partial<Record<PIICategory, number>>;
}

export type ActionSafetyLevel = 'benign' | 'sensitive' | 'irreversible';

export interface ActionSafetyEvaluation {
  action: AgentAction;
  level: ActionSafetyLevel;
  requiresApproval: boolean;
  reason?: string;
  elementLabel?: string;
  elementTag?: string;
}

export interface UserProfile {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  dob?: string;
  gender?: string;
  category?: string;
  fatherName?: string;
  motherName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  collegeName?: string;
  rollNo?: string;
  degree?: string;
  branch?: string;
  graduationYear?: string;
  cgpa?: string;
  aadhaar?: string;
  pan?: string;
  customFields?: Record<string, string>;
}

export interface WorkflowRecordedStep {
  action: AgentAction;
  selector?: string;
  label?: string;
  tag?: string;
  value?: string;
  description?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  domain: string;
  urlPattern: string;
  steps: WorkflowRecordedStep[];
  createdAt: number;
  updatedAt: number;
}

export interface PromptTemplate {
  id: string;
  title: string;
  prompt: string;
  category: 'scholarship' | 'exam' | 'erp' | 'general';
  pinned: boolean;
}

export interface ExtensionSettings {
  geminiApiKey: string;
  modelName: string;
  executionMode: 'autopilot' | 'step-by-step';
  dryRun: boolean;
  maxSteps: number;
  domainAllowList: string[];
  language: 'en' | 'hi' | 'hinglish';
}

export interface StartRunPayload {
  command: string;
  tabId?: number;
}

export interface ReplayWorkflowPayload {
  workflowId: string;
  tabId?: number;
}

export interface ConfirmActionPayload {
  approved: boolean;
  actionIndex?: number;
}

export interface AnswerUserQuestionPayload {
  answer: string;
}

export interface LogItem {
  id: string;
  timestamp: number;
  type: 'info' | 'thought' | 'action' | 'warning' | 'error' | 'success' | 'user';
  text: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRunState {
  isRunning: boolean;
  isPaused: boolean;
  currentStep: number;
  maxSteps: number;
  command: string;
  currentThought?: string;
  pendingApproval?: ActionSafetyEvaluation;
  pendingQuestion?: AskUserAction;
  logs: LogItem[];
}
