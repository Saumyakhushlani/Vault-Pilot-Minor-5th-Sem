import { UserProfile } from './types';

export const PROFILE_STORAGE_KEY = 'vp_user_profile';
export const SETTINGS_STORAGE_KEY = 'vp_settings';
export const WORKFLOWS_STORAGE_KEY = 'vp_workflows';
export const AUDIT_STORAGE_KEY = 'vp_audit_logs';

export const DEFAULT_USER_PROFILE: UserProfile = {
  fullName: '',
  firstName: '',
  lastName: '',
  dob: '',
  gender: '',
  category: '',
  fatherName: '',
  motherName: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  collegeName: '',
  rollNo: '',
  degree: '',
  branch: '',
  graduationYear: '',
  cgpa: '',
  aadhaar: '',
  pan: '',
  customFields: {},
};

const TOKEN_KEY_MAP: Record<string, keyof UserProfile> = {
  'profile.full_name': 'fullName',
  'profile.fullname': 'fullName',
  'profile.name': 'fullName',
  'profile.first_name': 'firstName',
  'profile.firstname': 'firstName',
  'profile.last_name': 'lastName',
  'profile.lastname': 'lastName',
  'profile.dob': 'dob',
  'profile.date_of_birth': 'dob',
  'profile.gender': 'gender',
  'profile.category': 'category',
  'profile.caste': 'category',
  'profile.father_name': 'fatherName',
  'profile.father': 'fatherName',
  'profile.mother_name': 'motherName',
  'profile.mother': 'motherName',
  'profile.email': 'email',
  'profile.phone': 'phone',
  'profile.mobile': 'phone',
  'profile.contact': 'phone',
  'profile.address': 'address',
  'profile.city': 'city',
  'profile.state': 'state',
  'profile.pincode': 'pincode',
  'profile.zip': 'pincode',
  'profile.college': 'collegeName',
  'profile.college_name': 'collegeName',
  'profile.roll_no': 'rollNo',
  'profile.rollno': 'rollNo',
  'profile.scholar_no': 'rollNo',
  'profile.degree': 'degree',
  'profile.branch': 'branch',
  'profile.graduation_year': 'graduationYear',
  'profile.cgpa': 'cgpa',
  'profile.aadhaar': 'aadhaar',
  'profile.pan': 'pan',
};

export async function getProfile(): Promise<UserProfile> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const res = await chrome.storage.local.get(PROFILE_STORAGE_KEY);
    return (res[PROFILE_STORAGE_KEY] as UserProfile) || { ...DEFAULT_USER_PROFILE };
  }
  return { ...DEFAULT_USER_PROFILE };
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [PROFILE_STORAGE_KEY]: profile });
  }
}

export function getAvailableProfileTokens(profile?: UserProfile): string[] {
  const tokens = Object.keys(TOKEN_KEY_MAP).map((k) => `{${k}}`);

  if (profile?.customFields) {
    for (const customKey of Object.keys(profile.customFields)) {
      tokens.push(`{profile.custom.${customKey}}`);
    }
  }

  return Array.from(new Set(tokens));
}

export function substituteProfileValues(text: string, profile: UserProfile): string {
  if (!text || typeof text !== 'string') return text;

  return text.replace(/\{profile\.([a-zA-Z0-9_.-]+)\}/g, (match, fieldName) => {
    const fullKey = `profile.${fieldName}`.toLowerCase();

    if (fullKey in TOKEN_KEY_MAP) {
      const prop = TOKEN_KEY_MAP[fullKey];
      const val = profile[prop];
      if (typeof val === 'string' && val.trim() !== '') {
        return val;
      }
    }

    if (fieldName.startsWith('custom.') && profile.customFields) {
      const customKey = fieldName.slice(7);
      if (profile.customFields[customKey]) {
        return profile.customFields[customKey];
      }
    }

    if (fieldName in profile) {
      const val = (profile as Record<string, unknown>)[fieldName];
      if (typeof val === 'string' && val.trim() !== '') {
        return val;
      }
    }

    return match;
  });
}

export async function exportAllData(): Promise<string> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return JSON.stringify({ error: 'Storage API unavailable' });
  }

  const all = await chrome.storage.local.get(null);

  if (all[SETTINGS_STORAGE_KEY]) {
    const sanitizedSettings = { ...all[SETTINGS_STORAGE_KEY] };
    delete sanitizedSettings.geminiApiKey;
    all[SETTINGS_STORAGE_KEY] = sanitizedSettings;
  }

  return JSON.stringify(
    {
      version: '1.1',
      exportedAt: new Date().toISOString(),
      data: all,
    },
    null,
    2
  );
}

export async function wipeAllData(): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.clear();
  }
}
