import { Workflow, WorkflowRecordedStep, PromptTemplate } from './types';
import { WORKFLOWS_STORAGE_KEY } from './vault';

export const TEMPLATES_STORAGE_KEY = 'vp_prompt_templates';

export const DEFAULT_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'template_scholarship_personal',
    title: 'Fill Scholarship Personal Details',
    prompt: 'Fill this scholarship application form using my saved personal and academic profile details. Stop before clicking submit.',
    category: 'scholarship',
    pinned: true,
  },
  {
    id: 'template_exam_registration',
    title: 'Semester Exam Form',
    prompt: 'Fill the semester examination registration form with my college roll number, degree, branch, and personal details.',
    category: 'exam',
    pinned: true,
  },
  {
    id: 'template_erp_admission',
    title: 'College ERP Profile Update',
    prompt: 'Fill the student profile section with my contact address, parent details, and academic marks from my vault.',
    category: 'erp',
    pinned: false,
  },
  {
    id: 'template_job_application',
    title: 'Job / Internship Application',
    prompt: 'Fill this internship application form with my contact information, degree, graduation year, and CGPA.',
    category: 'general',
    pinned: false,
  },
];

export async function getSavedWorkflows(): Promise<Workflow[]> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const res = await chrome.storage.local.get(WORKFLOWS_STORAGE_KEY);
    return (res[WORKFLOWS_STORAGE_KEY] as Workflow[]) || [];
  }
  return [];
}

export async function saveWorkflow(
  name: string,
  domain: string,
  urlPattern: string,
  steps: WorkflowRecordedStep[],
  description?: string
): Promise<Workflow> {
  const workflows = await getSavedWorkflows();
  const id = `wf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const newWorkflow: Workflow = {
    id,
    name: name.trim(),
    description: description?.trim() || '',
    domain,
    urlPattern,
    steps,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  workflows.push(newWorkflow);

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [WORKFLOWS_STORAGE_KEY]: workflows });
  }

  return newWorkflow;
}

export async function deleteWorkflow(id: string): Promise<void> {
  const workflows = await getSavedWorkflows();
  const filtered = workflows.filter((w) => w.id !== id);

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [WORKFLOWS_STORAGE_KEY]: filtered });
  }
}

export async function getPromptTemplates(): Promise<PromptTemplate[]> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const res = await chrome.storage.local.get(TEMPLATES_STORAGE_KEY);
    const userTemplates = (res[TEMPLATES_STORAGE_KEY] as PromptTemplate[]) || [];
    const userIds = new Set(userTemplates.map((t) => t.id));
    const combined = [...userTemplates];
    for (const d of DEFAULT_PROMPT_TEMPLATES) {
      if (!userIds.has(d.id)) {
        combined.push(d);
      }
    }
    return combined;
  }
  return [...DEFAULT_PROMPT_TEMPLATES];
}

export async function savePromptTemplate(template: PromptTemplate): Promise<void> {
  const current = await getPromptTemplates();
  const index = current.findIndex((t) => t.id === template.id);

  if (index >= 0) {
    current[index] = template;
  } else {
    current.push(template);
  }

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [TEMPLATES_STORAGE_KEY]: current });
  }
}
