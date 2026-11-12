import { piiShield } from './pii-shield';
import { streamGemini } from '../background/llm-client';
import { parseAndValidateAgentResponse } from './schema';
import { AgentResponse, AuditLogEntry, ScannedElement } from './types';
import { AUDIT_STORAGE_KEY } from './vault';
import { buildUserPrompt, SYSTEM_PROMPT } from './prompts';

export interface ModelRequestPayload {
  command: string;
  pageTitle: string;
  pageUrl: string;
  elements: ScannedElement[];
  customTokens?: string[];
}

export interface GatewayContext {
  feature: 'agent_loop' | 'workflow_healing' | 'page_summary' | 'test';
}

export interface GatewayConfig {
  apiKey: string;
  modelName?: string;
  signal?: AbortSignal;
}

async function recordAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const res = await chrome.storage.local.get(AUDIT_STORAGE_KEY);
      const logs: AuditLogEntry[] = res[AUDIT_STORAGE_KEY] || [];
      if (logs.length > 100) {
        logs.shift();
      }
      logs.push(entry);
      await chrome.storage.local.set({ [AUDIT_STORAGE_KEY]: logs });
    }
  } catch {
    // Fail-open for audit logging errors
  }
}

export async function sendToModel(
  payload: ModelRequestPayload,
  ctx: GatewayContext,
  config: GatewayConfig,
  onChunk?: (token: string) => void
): Promise<AgentResponse> {
  const maskedElementsResult = piiShield.maskPayload(payload.elements);
  const maskedCommandResult = piiShield.maskString(payload.command);

  const totalMasked = maskedElementsResult.stats.totalMasked + maskedCommandResult.stats.totalMasked;

  await recordAuditLog({
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: Date.now(),
    feature: ctx.feature,
    maskedCount: totalMasked,
    byCategory: {
      AADHAAR: maskedElementsResult.stats.byCategory.AADHAAR + maskedCommandResult.stats.byCategory.AADHAAR,
      PAN: maskedElementsResult.stats.byCategory.PAN + maskedCommandResult.stats.byCategory.PAN,
      CARD: maskedElementsResult.stats.byCategory.CARD + maskedCommandResult.stats.byCategory.CARD,
      PASSWORD: maskedElementsResult.stats.byCategory.PASSWORD + maskedCommandResult.stats.byCategory.PASSWORD,
      OTP: maskedElementsResult.stats.byCategory.OTP + maskedCommandResult.stats.byCategory.OTP,
      MOBILE: maskedElementsResult.stats.byCategory.MOBILE + maskedCommandResult.stats.byCategory.MOBILE,
    },
  });

  const sanitizedUserPrompt = buildUserPrompt({
    command: maskedCommandResult.masked,
    pageTitle: payload.pageTitle,
    pageUrl: payload.pageUrl,
    elements: maskedElementsResult.payload,
    customTokens: payload.customTokens,
  });

  let assembledResponse = '';

  for await (const chunk of streamGemini({
    apiKey: config.apiKey,
    model: config.modelName || 'gemini-2.0-flash',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: sanitizedUserPrompt,
    signal: config.signal,
  })) {
    assembledResponse += chunk;
    if (onChunk) {
      onChunk(chunk);
    }
  }

  const validation = parseAndValidateAgentResponse(assembledResponse);
  if (!validation.success) {
    throw new Error(`Model returned invalid action schema: ${validation.error}`);
  }

  return validation.data;
}
