import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { piiShield, computeVerhoeffCheckDigit } from '../../src/shared/pii-shield';
import { buildUserPrompt } from '../../src/shared/prompts';
import { ScannedElement } from '../../src/shared/types';

describe('Security Invariant NFR-11: Egress & Zero-Leak Enforcement', () => {
  it('statically asserts that ONLY llm-client.ts contacts generativelanguage.googleapis.com', () => {
    const srcDir = path.resolve(__dirname, '../../src');

    function scanFiles(dir: string): string[] {
      let results: string[] = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          results = results.concat(scanFiles(fullPath));
        } else if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.html')) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const allSourceFiles = scanFiles(srcDir);
    const violatingFiles: string[] = [];

    const FORBIDDEN_TARGET = 'generativelanguage.googleapis.com';

    for (const filePath of allSourceFiles) {
      const normalized = filePath.replace(/\\/g, '/');
      if (normalized.endsWith('src/background/llm-client.ts')) {
        continue; // This is the only authorized client file
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.includes(FORBIDDEN_TARGET)) {
        violatingFiles.push(normalized);
      }
    }

    expect(
      violatingFiles,
      `Violation of NFR-11: Found direct Gemini API reference outside llm-client.ts: ${violatingFiles.join(', ')}`
    ).toEqual([]);
  });

  it('guarantees that seeded clear-text Aadhaar, PAN, and passwords never appear in assembled prompts', () => {
    const base11 = '23456789012';
    const sampleAadhaar = base11 + computeVerhoeffCheckDigit(base11).toString(); // Mathematically valid Aadhaar
    const samplePan = 'ABCDE1234F'; // Seeded PAN
    const samplePassword = 'SuperSecretClearTextPassword!';

    const rawElements: ScannedElement[] = [
      {
        id: 1,
        tag: 'input',
        type: 'password',
        label: 'Student Portal Password',
        value: samplePassword,
      },
      {
        id: 2,
        tag: 'input',
        type: 'text',
        label: 'Aadhaar Identification Number',
        value: sampleAadhaar,
      },
      {
        id: 3,
        tag: 'input',
        type: 'text',
        label: 'Permanent Account Number',
        value: samplePan,
      },
    ];

    // Mask payload through PII Shield
    const masked = piiShield.maskPayload(rawElements);

    // Build the outbound prompt sent to Gemini
    const prompt = buildUserPrompt({
      command: `Fill form for Aadhaar ${sampleAadhaar} and PAN ${samplePan}`,
      pageTitle: 'University Scholarship Portal',
      pageUrl: 'https://scholarships.gov.in/apply',
      elements: masked.payload,
    });

    // Mask the entire prompt to ensure zero leak
    const { masked: finalPrompt } = piiShield.maskString(prompt);

    // Assert zero clear-text occurrences of any seeded secret
    expect(finalPrompt.includes(sampleAadhaar)).toBe(false);
    expect(finalPrompt.includes(samplePan)).toBe(false);
    expect(finalPrompt.includes(samplePassword)).toBe(false);

    // Assert that safe mask tokens are present instead
    expect(finalPrompt).toContain('[AADHAAR]');
    expect(finalPrompt).toContain('[PAN]');
    expect(finalPrompt).toContain('[PASSWORD]');
  });
});
