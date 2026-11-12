import { UserProfile, PortalCredential } from './types';

export const PROFILE_STORAGE_KEY = 'vp_user_profile';
export const SETTINGS_STORAGE_KEY = 'vp_settings';
export const WORKFLOWS_STORAGE_KEY = 'vp_workflows';
export const AUDIT_STORAGE_KEY = 'vp_audit_logs';
export const PORTAL_CREDENTIALS_STORAGE_KEY = 'vp_portal_credentials';

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

export const TOKEN_KEY_MAP: Record<string, keyof UserProfile> = {
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


export async function getPortalCredential(domain: string): Promise<PortalCredential | null> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const res = await chrome.storage.local.get(PORTAL_CREDENTIALS_STORAGE_KEY);
    const map = (res[PORTAL_CREDENTIALS_STORAGE_KEY] as Record<string, PortalCredential>) || {};
    const cleanDomain = domain.toLowerCase().replace(/^www\./, '').trim();
    return map[cleanDomain] || null;
  }
  return null;
}

export async function savePortalCredential(credential: PortalCredential): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const res = await chrome.storage.local.get(PORTAL_CREDENTIALS_STORAGE_KEY);
    const map = (res[PORTAL_CREDENTIALS_STORAGE_KEY] as Record<string, PortalCredential>) || {};
    const cleanDomain = credential.domain.toLowerCase().replace(/^www\./, '').trim();
    map[cleanDomain] = {
      ...credential,
      domain: cleanDomain,
      updatedAt: Date.now(),
    };
    await chrome.storage.local.set({ [PORTAL_CREDENTIALS_STORAGE_KEY]: map });
  }
}

export async function listPortalCredentials(): Promise<PortalCredential[]> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const res = await chrome.storage.local.get(PORTAL_CREDENTIALS_STORAGE_KEY);
    const map = (res[PORTAL_CREDENTIALS_STORAGE_KEY] as Record<string, PortalCredential>) || {};
    return Object.values(map);
  }
  return [];
}

export async function deletePortalCredential(domain: string): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const res = await chrome.storage.local.get(PORTAL_CREDENTIALS_STORAGE_KEY);
    const map = (res[PORTAL_CREDENTIALS_STORAGE_KEY] as Record<string, PortalCredential>) || {};
    const cleanDomain = domain.toLowerCase().replace(/^www\./, '').trim();
    delete map[cleanDomain];
    await chrome.storage.local.set({ [PORTAL_CREDENTIALS_STORAGE_KEY]: map });
  }
}

export function findUnresolvedTokens(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  const matches = text.match(/\{(profile\.[a-zA-Z0-9_.-]+|portal\.[a-zA-Z0-9_.-]+)\}/g);
  return matches ? Array.from(new Set(matches)) : [];
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [PROFILE_STORAGE_KEY]: profile });
  }
}

export function getAvailableProfileTokens(
  profile?: UserProfile,
  portalCred?: PortalCredential | null
): string[] {
  const tokens = Object.keys(TOKEN_KEY_MAP).map((k) => `{${k}}`);

  if (profile?.customFields) {
    for (const customKey of Object.keys(profile.customFields)) {
      tokens.push(`{profile.custom.${customKey}}`);
    }
  }

  if (portalCred) {
    tokens.push('{portal.username}', '{portal.password}', '{portal.id}');
  }

  return Array.from(new Set(tokens));
}

export function substituteProfileValues(
  text: string,
  profile: UserProfile,
  portalCred?: PortalCredential | null
): string {
  if (!text || typeof text !== 'string') return text;

  let result = text;

  if (portalCred) {
    result = result.replace(/\{portal\.(username|user|id)\}/gi, portalCred.username || '');
    result = result.replace(/\{portal\.(password|pass|pwd)\}/gi, portalCred.password || '');
  }

  result = result.replace(/\{profile\.([a-zA-Z0-9_.-]+)\}/g, (match, fieldName) => {
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

  return result;
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
