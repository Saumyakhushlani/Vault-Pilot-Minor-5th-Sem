import { describe, it, expect } from 'vitest';
import {
  validateVerhoeff,
  computeVerhoeffCheckDigit,
  validateLuhn,
  isPAN,
  maskString,
  maskElement,
  maskPayload,
  classifyFieldHeuristic,
} from '../../src/shared/pii-shield';
import { ScannedElement } from '../../src/shared/types';

describe('PII Shield - Verhoeff Checksum (Aadhaar)', () => {
  it('computes and validates Verhoeff checksums correctly', () => {
    // Generate valid 12-digit number starting with 2-9
    const base11 = '23456789012';
    const checkDigit = computeVerhoeffCheckDigit(base11);
    const validAadhaar = base11 + checkDigit.toString();

    expect(validAadhaar.length).toBe(12);
    expect(validateVerhoeff(validAadhaar)).toBe(true);

    // Single digit error must fail
    const corruptedSingle = base11 + ((checkDigit + 1) % 10).toString();
    expect(validateVerhoeff(corruptedSingle)).toBe(false);

    // Adjacent transposition error must fail
    const transposed = validAadhaar.slice(0, 4) + validAadhaar[5] + validAadhaar[4] + validAadhaar.slice(6);
    expect(validateVerhoeff(transposed)).toBe(false);
  });

  it('masks valid Aadhaar numbers and ignores non-Aadhaar 12-digit reference numbers', () => {
    // Valid Aadhaar with spaces
    const base = '34567890123';
    const check = computeVerhoeffCheckDigit(base);
    const validAadhaarWithSpaces = `3456 7890 123${check}`;

    const textWithAadhaar = `My Aadhaar is ${validAadhaarWithSpaces} for verification.`;
    const res = maskString(textWithAadhaar);
    expect(res.masked).toBe('My Aadhaar is [AADHAAR] for verification.');
    expect(res.stats.byCategory.AADHAAR).toBe(1);

    // Harmless 12-digit order/reference number that fails Verhoeff
    // Find an invalid 12-digit number
    let harmlessRef = '999999999999';
    if (validateVerhoeff(harmlessRef)) {
      harmlessRef = '999999999998';
    }
    const textWithRef = `Order reference number: ${harmlessRef}.`;
    const resRef = maskString(textWithRef);
    expect(resRef.masked).toBe(`Order reference number: ${harmlessRef}.`);
    expect(resRef.stats.byCategory.AADHAAR).toBe(0);
  });
});

describe('PII Shield - Luhn Checksum (Payment Cards)', () => {
  it('validates and masks standard credit/debit cards', () => {
    // Standard test Visa card (4111 1111 1111 1111)
    const validCard = '4111 1111 1111 1111';
    expect(validateLuhn(validCard)).toBe(true);

    const masked = maskString(`Payment with card ${validCard} now.`);
    expect(masked.masked).toBe('Payment with card [CARD] now.');
    expect(masked.stats.byCategory.CARD).toBe(1);
  });

  it('does not mask random 16-digit numbers that fail Luhn', () => {
    // 16-digit string failing Luhn
    const invalidCard = '4111 1111 1111 1112';
    expect(validateLuhn(invalidCard)).toBe(false);

    const masked = maskString(`Tracking ID: ${invalidCard}`);
    expect(masked.masked).toBe(`Tracking ID: ${invalidCard}`);
    expect(masked.stats.byCategory.CARD).toBe(0);
  });
});

describe('PII Shield - Indian PAN Card Pattern', () => {
  it('identifies and masks PAN formats', () => {
    const validPan = 'ABCDE1234F';
    expect(isPAN(validPan)).toBe(true);

    const res = maskString(`Taxpayer PAN: ${validPan} attached.`);
    expect(res.masked).toBe('Taxpayer PAN: [PAN] attached.');
    expect(res.stats.byCategory.PAN).toBe(1);
  });

  it('rejects invalid PAN strings', () => {
    expect(isPAN('12345ABCDE')).toBe(false);
    expect(isPAN('ABC1234DEF')).toBe(false);
  });
});

describe('PII Shield - Field Heuristic Masking', () => {
  it('identifies password fields and masks values', () => {
    const element: ScannedElement = {
      id: 1,
      tag: 'input',
      type: 'password',
      label: 'Enter Portal Password',
      value: 'MySecretPassword123!',
    };

    expect(classifyFieldHeuristic(element)).toBe('PASSWORD');
    const { element: maskedEl, stats } = maskElement(element);
    expect(maskedEl.value).toBe('[PASSWORD]');
    expect(stats.byCategory.PASSWORD).toBe(1);
  });

  it('identifies OTP and CVV fields', () => {
    const otpEl: ScannedElement = {
      id: 2,
      tag: 'input',
      type: 'text',
      label: 'One Time Password (OTP)',
      value: '584920',
    };
    expect(classifyFieldHeuristic(otpEl)).toBe('OTP');
    const resOtp = maskElement(otpEl);
    expect(resOtp.element.value).toBe('[OTP]');

    const cvvEl: ScannedElement = {
      id: 3,
      tag: 'input',
      type: 'text',
      label: 'CVV / Security Code',
      value: '849',
    };
    expect(classifyFieldHeuristic(cvvEl)).toBe('CVV');
    const resCvv = maskElement(cvvEl);
    expect(resCvv.element.value).toBe('[CVV]');
  });
});

describe('PII Shield - Universal Payload Masker', () => {
  it('deeply sanitizes complex nested payloads', () => {
    const rawPayload = {
      metadata: {
        timestamp: 1700000000,
        page: 'College Portal',
      },
      elements: [
        {
          id: 10,
          tag: 'input',
          type: 'text',
          label: 'Permanent Account Number',
          value: 'BNZPK7412A',
        },
        {
          id: 11,
          tag: 'input',
          type: 'text',
          label: 'Mobile Number',
          value: '+91 9876543210',
        },
      ],
      userSecretPassword: 'PlainTextPasswordShouldNeverEscape',
    };

    const { payload: sanitized, stats } = maskPayload(rawPayload);

    expect(sanitized.userSecretPassword).toBe('[PASSWORD]');
    expect(sanitized.elements[0].value).toBe('[PAN]');
    expect(sanitized.elements[1].value).toBe('[MOBILE]');
    expect(stats.totalMasked).toBeGreaterThanOrEqual(3);
  });
});
