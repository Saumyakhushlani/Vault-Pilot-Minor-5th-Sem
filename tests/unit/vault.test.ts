import { describe, it, expect, beforeEach } from 'vitest';
import {
  substituteProfileValues,
  getAvailableProfileTokens,
  exportAllData,
  wipeAllData,
  saveProfile,
  getProfile,
  SETTINGS_STORAGE_KEY,
} from '../../src/shared/vault';
import { UserProfile } from '../../src/shared/types';

describe('Profile Vault - Token Substitution Engine', () => {
  const mockProfile: UserProfile = {
    fullName: 'Saumya Khushlani',
    dob: '2004-05-15',
    gender: 'Male',
    category: 'General',
    email: 'saumya@example.com',
    phone: '9876543210',
    rollNo: '24112011148',
    collegeName: 'MANIT Bhopal',
    cgpa: '8.75',
    aadhaar: '234567890128',
    pan: 'ABCDE1234F',
    customFields: {
      preferred_stream: 'Artificial Intelligence',
    },
  };

  it('substitutes standard profile tokens accurately', () => {
    const template = 'Applicant {profile.full_name} born on {profile.dob} with Roll {profile.roll_no}';
    const result = substituteProfileValues(template, mockProfile);

    expect(result).toBe('Applicant Saumya Khushlani born on 2004-05-15 with Roll 24112011148');
  });

  it('substitutes sensitive Aadhaar and PAN only at substitution phase', () => {
    const template = 'ID: {profile.aadhaar} and Tax: {profile.pan}';
    const result = substituteProfileValues(template, mockProfile);

    expect(result).toBe('ID: 234567890128 and Tax: ABCDE1234F');
  });

  it('substitutes custom fields dynamically', () => {
    const template = 'Stream: {profile.custom.preferred_stream}';
    const result = substituteProfileValues(template, mockProfile);

    expect(result).toBe('Stream: Artificial Intelligence');
  });

  it('preserves unpopulated or unrecognized placeholders intact', () => {
    const incompleteProfile: UserProfile = { fullName: 'Alex' };
    const template = 'Name: {profile.full_name}, Phone: {profile.phone}, Unknown: {profile.nonexistent}';
    const result = substituteProfileValues(template, incompleteProfile);

    expect(result).toBe('Name: Alex, Phone: {profile.phone}, Unknown: {profile.nonexistent}');
  });

  it('returns available profile tokens without leaking real values', () => {
    const tokens = getAvailableProfileTokens(mockProfile);

    expect(tokens).toContain('{profile.full_name}');
    expect(tokens).toContain('{profile.roll_no}');
    expect(tokens).toContain('{profile.custom.preferred_stream}');

    // Tokens must be placeholders, not actual user values
    const serialized = JSON.stringify(tokens);
    expect(serialized).not.toContain('Saumya Khushlani');
    expect(serialized).not.toContain('234567890128');
  });
});

describe('Profile Vault - Storage, Export & Sanitization', () => {
  beforeEach(() => {
    // Mock chrome.storage.local
    const storageMap = new Map<string, any>();
    (globalThis as any).chrome = {
      storage: {
        local: {
          get: (keys: any) => {
            if (keys === null) {
              const obj: Record<string, any> = {};
              for (const [k, v] of storageMap.entries()) {
                obj[k] = v;
              }
              return Promise.resolve(obj);
            }
            if (typeof keys === 'string') {
              return Promise.resolve({ [keys]: storageMap.get(keys) });
            }
            return Promise.resolve({});
          },
          set: (items: Record<string, any>) => {
            for (const [k, v] of Object.entries(items)) {
              storageMap.set(k, v);
            }
            return Promise.resolve();
          },
          clear: () => {
            storageMap.clear();
            return Promise.resolve();
          },
        },
      },
    };
  });

  it('persists and retrieves profile in local storage', async () => {
    const profile: UserProfile = { fullName: 'Test User', email: 'test@example.com' };
    await saveProfile(profile);
    const loaded = await getProfile();

    expect(loaded.fullName).toBe('Test User');
    expect(loaded.email).toBe('test@example.com');
  });

  it('strips API key from export per NFR-02', async () => {
    // Store settings with secret API key
    await (globalThis as any).chrome.storage.local.set({
      [SETTINGS_STORAGE_KEY]: {
        geminiApiKey: 'AIzaSySecretApiKeyShouldBeRedacted',
        modelName: 'gemini-2.0-flash',
      },
    });

    const exportedJson = await exportAllData();
    expect(exportedJson).not.toContain('AIzaSySecretApiKeyShouldBeRedacted');
    expect(exportedJson).toContain('gemini-2.0-flash');
  });

  it('completely erases all data on wipeAllData()', async () => {
    await saveProfile({ fullName: 'Data To Wipe' });
    await wipeAllData();
    const loaded = await getProfile();

    expect(loaded.fullName).toBe('');
  });
});
