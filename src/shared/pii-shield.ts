import { MaskResult, MaskStats, PIICategory, ScannedElement } from './types';

const VERHOEFF_D: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const VERHOEFF_P: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

const VERHOEFF_INV: number[] = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

export function validateVerhoeff(numStr: string): boolean {
  const clean = numStr.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(clean)) return false;

  let c = 0;
  const digits = clean.split('').map(Number).reverse();

  for (let i = 0; i < digits.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][digits[i]]];
  }

  return c === 0;
}

export function computeVerhoeffCheckDigit(numStr: string): number {
  const clean = numStr.replace(/[\s-]/g, '');
  let c = 0;
  const digits = clean.split('').map(Number).reverse();

  for (let i = 0; i < digits.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[(i + 1) % 8][digits[i]]];
  }

  return VERHOEFF_INV[c];
}

export function validateLuhn(numStr: string): boolean {
  const clean = numStr.replace(/[\s-]/g, '');
  if (!/^\d{13,19}$/.test(clean)) return false;

  let sum = 0;
  let alternate = false;

  for (let i = clean.length - 1; i >= 0; i--) {
    let digit = parseInt(clean.charAt(i), 10);
    if (alternate) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    alternate = !alternate;
  }

  return sum % 10 === 0;
}

export function isPAN(str: string): boolean {
  const clean = str.trim().toUpperCase();
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(clean);
}

const OTP_FIELD_REGEX = /\b(otp|one[\s_-]?time[\s_-]?password|verification[\s_-]?code|auth[\s_-]?code|mfa)\b/i;
const CVV_FIELD_REGEX = /\b(cvv|cvc|security[\s_-]?code|card[\s_-]?code)\b/i;
const AADHAAR_FIELD_REGEX = /\b(aadhaar|aadhar|uidai|uid[\s_-]?no|aadhaar[\s_-]?no)\b/i;
const PAN_FIELD_REGEX = /\b(pan[\s_-]?card|pan[\s_-]?no|pan[\s_-]?number|permanent[\s_-]?account[\s_-]?number)\b/i;
const CARD_FIELD_REGEX = /\b(card[\s_-]?number|credit[\s_-]?card|debit[\s_-]?card|cc[\s_-]?num|card[\s_-]?no)\b/i;
const PASSWORD_FIELD_REGEX = /\b(password|secret|passwd|pwd)\b/i;

const SENSITIVE_KEY_PASSWORD = /(password|secret|passwd|pwd)/i;
const SENSITIVE_KEY_OTP = /(otp|one.?time.?pass|verification.?code|auth.?code|mfa)/i;
const SENSITIVE_KEY_CVV = /(cvv|cvc|security.?code)/i;

export function classifyFieldHeuristic(el: {
  tag?: string;
  type?: string | null;
  name?: string;
  label?: string;
  placeholder?: string;
  id?: number | string;
}): PIICategory | null {
  const type = (el.type || '').toLowerCase();
  const metaText = `${el.name || ''} ${el.label || ''} ${el.placeholder || ''} ${el.tag || ''}`.toLowerCase();

  if (type === 'password') {
    return 'PASSWORD';
  }
  if (OTP_FIELD_REGEX.test(metaText)) {
    return 'OTP';
  }
  if (CVV_FIELD_REGEX.test(metaText)) {
    return 'CVV';
  }
  if (AADHAAR_FIELD_REGEX.test(metaText)) {
    return 'AADHAAR';
  }
  if (PAN_FIELD_REGEX.test(metaText)) {
    return 'PAN';
  }
  if (CARD_FIELD_REGEX.test(metaText)) {
    return 'CARD';
  }
  if (PASSWORD_FIELD_REGEX.test(metaText)) {
    return 'PASSWORD';
  }

  return null;
}

function createEmptyStats(): MaskStats {
  return {
    totalMasked: 0,
    byCategory: {
      AADHAAR: 0,
      PAN: 0,
      CARD: 0,
      CVV: 0,
      OTP: 0,
      PASSWORD: 0,
      MOBILE: 0,
      MASKED: 0,
    },
  };
}

function mergeStats(target: MaskStats, source: MaskStats): void {
  target.totalMasked += source.totalMasked;
  for (const cat of Object.keys(source.byCategory) as PIICategory[]) {
    target.byCategory[cat] += source.byCategory[cat];
  }
}

export function maskString(text: string): { masked: string; stats: MaskStats } {
  if (!text || typeof text !== 'string') {
    return { masked: text, stats: createEmptyStats() };
  }

  const stats = createEmptyStats();
  let result = text;

  const aadhaarRegex = /\b([2-9]\d{3}[ -]?\d{4}[ -]?\d{4})\b/g;
  result = result.replace(aadhaarRegex, (match, digitsOnly) => {
    const rawDigits = digitsOnly.replace(/[ -]/g, '');
    if (rawDigits.length === 12 && validateVerhoeff(rawDigits)) {
      stats.totalMasked++;
      stats.byCategory.AADHAAR++;
      return '[AADHAAR]';
    }
    return match;
  });

  const panRegex = /\b([A-Z]{5}[0-9]{4}[A-Z])\b/g;
  result = result.replace(panRegex, () => {
    stats.totalMasked++;
    stats.byCategory.PAN++;
    return '[PAN]';
  });

  const cardRegex = /\b((?:\d[ -]?){12,18}\d)\b/g;
  result = result.replace(cardRegex, (match, rawMatched) => {
    const rawDigits = rawMatched.replace(/[ -]/g, '');
    if (rawDigits.length >= 13 && rawDigits.length <= 19 && validateLuhn(rawDigits)) {
      stats.totalMasked++;
      stats.byCategory.CARD++;
      return '[CARD]';
    }
    return match;
  });

  const mobileRegex = /(?:(?:\+91[\s-]?)|\b)[6-9]\d{9}\b/g;
  result = result.replace(mobileRegex, () => {
    stats.totalMasked++;
    stats.byCategory.MOBILE++;
    return '[MOBILE]';
  });

  return { masked: result, stats };
}

export function maskElement(el: ScannedElement): { element: ScannedElement; stats: MaskStats } {
  const stats = createEmptyStats();
  const maskedEl: ScannedElement = { ...el };

  const heuristicCategory = classifyFieldHeuristic(el);

  if (heuristicCategory) {
    if (maskedEl.value && maskedEl.value.trim() !== '') {
      maskedEl.value = `[${heuristicCategory}]`;
      stats.totalMasked++;
      stats.byCategory[heuristicCategory]++;
    }
  } else if (maskedEl.value) {
    const { masked, stats: strStats } = maskString(maskedEl.value);
    maskedEl.value = masked;
    mergeStats(stats, strStats);
  }

  if (maskedEl.label) {
    const { masked, stats: labelStats } = maskString(maskedEl.label);
    maskedEl.label = masked;
    mergeStats(stats, labelStats);
  }
  if (maskedEl.placeholder) {
    const { masked, stats: phStats } = maskString(maskedEl.placeholder);
    maskedEl.placeholder = masked;
    mergeStats(stats, phStats);
  }

  return { element: maskedEl, stats };
}

export function maskPayload<T>(payload: T): MaskResult<T> {
  const stats = createEmptyStats();

  function traverse(item: unknown): unknown {
    if (item === null || item === undefined) {
      return item;
    }

    if (typeof item === 'string') {
      const { masked, stats: s } = maskString(item);
      mergeStats(stats, s);
      return masked;
    }

    if (typeof item === 'number' || typeof item === 'boolean') {
      return item;
    }

    if (Array.isArray(item)) {
      return item.map((element) => traverse(element));
    }

    if (typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      if (typeof obj.id === 'number' && typeof obj.tag === 'string') {
        const { element, stats: elStats } = maskElement(obj as unknown as ScannedElement);
        mergeStats(stats, elStats);
        return element;
      }

      const sanitizedObj: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(obj)) {
        if (SENSITIVE_KEY_PASSWORD.test(key)) {
          sanitizedObj[key] = '[PASSWORD]';
          stats.totalMasked++;
          stats.byCategory.PASSWORD++;
        } else if (SENSITIVE_KEY_OTP.test(key)) {
          sanitizedObj[key] = '[OTP]';
          stats.totalMasked++;
          stats.byCategory.OTP++;
        } else if (SENSITIVE_KEY_CVV.test(key)) {
          sanitizedObj[key] = '[CVV]';
          stats.totalMasked++;
          stats.byCategory.CVV++;
        } else {
          sanitizedObj[key] = traverse(val);
        }
      }
      return sanitizedObj;
    }

    return item;
  }

  const maskedPayload = traverse(payload) as T;
  return { payload: maskedPayload, stats };
}

export const piiShield = {
  maskPayload,
  maskString,
  maskElement,
  validateVerhoeff,
  computeVerhoeffCheckDigit,
  validateLuhn,
  isPAN,
  classifyFieldHeuristic,
};
