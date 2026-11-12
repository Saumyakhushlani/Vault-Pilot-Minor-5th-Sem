import { describe, it, expect } from 'vitest';
import {
  extractCredentialsFromCommand,
  humanizeToken,
} from '../../src/shared/credential-extractor';

describe('Credential Extractor & Zero-Egress Redactor', () => {
  it('extracts username and password from conversational sentences', () => {
    const input = 'my id is xyashbdf and password is ijndifbsd login to erp portal';
    const result = extractCredentialsFromCommand(input);

    expect(result.hasCredentials).toBe(true);
    expect(result.username).toBe('xyashbdf');
    expect(result.password).toBe('ijndifbsd');
  });

  it('redacts plaintext password completely from the sanitized command for LLM', () => {
    const input = 'my id is 24112011148 and password is SuperSecretPass! please login';
    const result = extractCredentialsFromCommand(input);

    expect(result.hasCredentials).toBe(true);
    expect(result.username).toBe('24112011148');
    expect(result.password).toBe('SuperSecretPass!');
    expect(result.sanitizedCommand).not.toContain('SuperSecretPass!');
    expect(result.sanitizedCommand).toContain('[SECURE_CREDENTIAL_MASKED]');
  });

  it('handles commands with colon formatting e.g. username: foo pass: bar', () => {
    const input = 'username: student_alex pass: myPass123 open result page';
    const result = extractCredentialsFromCommand(input);

    expect(result.hasCredentials).toBe(true);
    expect(result.username).toBe('student_alex');
    expect(result.password).toBe('myPass123');
    expect(result.sanitizedCommand).not.toContain('myPass123');
  });

  it('handles commands with no credentials gracefully', () => {
    const input = 'fill this scholarship application with my saved profile';
    const result = extractCredentialsFromCommand(input);

    expect(result.hasCredentials).toBe(false);
    expect(result.username).toBeUndefined();
    expect(result.password).toBeUndefined();
    expect(result.sanitizedCommand).toBe(input);
  });

  it('humanizes profile tokens accurately for user clarification prompts', () => {
    expect(humanizeToken('{profile.aadhaar}')).toBe('Aadhaar UID Number');
    expect(humanizeToken('{profile.pan}')).toBe('PAN Card Number');
    expect(humanizeToken('{profile.cgpa}')).toBe('CGPA');
    expect(humanizeToken('{profile.roll_no}')).toBe('Roll / Scholar Number');
    expect(humanizeToken('{profile.full_name}')).toBe('Full Name');
  });
});
