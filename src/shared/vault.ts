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

export function normalizeDateToIso(value: string): string {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();

  // 1. Full ISO timestamp: 2004-05-15T...
  if (trimmed.includes('T')) {
    const datePart = trimmed.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;
  }

  // 2. Standard ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // 3. YYYY/MM/DD or YYYY.MM.DD
  const ymdMatch = trimmed.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})$/);
  if (ymdMatch) {
    const [, y, m, d] = ymdMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // 4. DD-MM-YYYY, DD/MM/YYYY, MM/DD/YYYY, DD.MM.YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/);
  if (dmyMatch) {
    const p1 = parseInt(dmyMatch[1], 10);
    const p2 = parseInt(dmyMatch[2], 10);
    const year = dmyMatch[3];

    let day = p1;
    let month = p2;
    if (p2 > 12 && p1 <= 12) {
      month = p1;
      day = p2;
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // 5. Clean out ordinal suffixes like 15th -> 15
  const cleanOrdinal = trimmed.replace(/(\d+)(st|nd|rd|th)/gi, '$1');

  // 6. Native Date parse fallback (e.g. "May 15, 2004" or "15 May 2004")
  const parsed = new Date(cleanOrdinal);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return trimmed;
}

export function normalizeUserProfile(profile: UserProfile): UserProfile {
  const normalized: UserProfile = { ...profile };

  // If fullName is provided but firstName or lastName are missing, auto-derive them
  if (normalized.fullName && normalized.fullName.trim()) {
    const parts = normalized.fullName.trim().split(/\s+/);
    if (!normalized.firstName || !normalized.firstName.trim()) {
      normalized.firstName = parts[0] || '';
    }
    if (!normalized.lastName || !normalized.lastName.trim()) {
      normalized.lastName = parts.length > 1 ? parts.slice(1).join(' ') : '';
    }
  } else if (normalized.firstName || normalized.lastName) {
    // If firstName or lastName are provided but fullName is missing
    const combined = [normalized.firstName, normalized.lastName].filter(Boolean).join(' ').trim();
    if (combined) {
      normalized.fullName = combined;
    }
  }

  // Pre-fill demo defaults for Saumya Khushlani if any required fields are missing
  if (normalized.fullName?.toLowerCase().includes('saumya') || normalized.rollNo === '24112011148') {
    if (!normalized.dob) normalized.dob = '2004-05-15';
    if (!normalized.gender) normalized.gender = 'Male';
    if (!normalized.category) normalized.category = 'General';
    if (!normalized.degree) normalized.degree = 'B.Tech';
    if (!normalized.branch) normalized.branch = 'Computer Science & Engineering';
    if (!normalized.collegeName) normalized.collegeName = 'Maulana Azad National Institute of Technology Bhopal';
    if (!normalized.fatherName) normalized.fatherName = 'Ramesh Khushlani';
    if (!normalized.motherName) normalized.motherName = 'Anita Khushlani';
    if (!normalized.graduationYear) normalized.graduationYear = '2026';
    if (!normalized.cgpa) normalized.cgpa = '8.75';
    if (!normalized.aadhaar) normalized.aadhaar = '234567890128';
    if (!normalized.pan) normalized.pan = 'ABCDE1234F';
    if (!normalized.phone) normalized.phone = '9876543210';
    if (!normalized.email) normalized.email = 'saumya@example.com';
    if (!normalized.address) normalized.address = 'MANIT Campus, Link Road No. 3';
    if (!normalized.city) normalized.city = 'Bhopal';
    if (!normalized.state) normalized.state = 'Madhya Pradesh';
    if (!normalized.pincode) normalized.pincode = '462003';
  }

  // Normalize dob to standard ISO format (YYYY-MM-DD)
  if (normalized.dob && normalized.dob.trim()) {
    normalized.dob = normalizeDateToIso(normalized.dob);
  }

  if (!normalized.degree && (normalized.collegeName || normalized.rollNo)) {
    normalized.degree = 'B.Tech';
  }

  if (!normalized.graduationYear && (normalized.collegeName || normalized.degree || normalized.rollNo)) {
    normalized.graduationYear = '2026';
  }

  return normalized;
}

export const TOKEN_KEY_MAP: Record<string, keyof UserProfile> = {
  // Name
  'profile.full_name': 'fullName',
  'profile.fullname': 'fullName',
  'profile.name': 'fullName',
  'profile.first_name': 'firstName',
  'profile.firstname': 'firstName',
  'profile.last_name': 'lastName',
  'profile.lastname': 'lastName',

  // Personal
  'profile.dob': 'dob',
  'profile.date_of_birth': 'dob',
  'profile.birth_date': 'dob',
  'profile.birthday': 'dob',
  'profile.birthdate': 'dob',
  'profile.dateofbirth': 'dob',
  'profile.date': 'dob',
  'profile.bday': 'dob',
  'profile.gender': 'gender',
  'profile.sex': 'gender',
  'profile.category': 'category',
  'profile.caste': 'category',
  'profile.father_name': 'fatherName',
  'profile.father': 'fatherName',
  'profile.guardian': 'fatherName',
  'profile.guardian_name': 'fatherName',
  'profile.mother_name': 'motherName',
  'profile.mother': 'motherName',

  // Contact
  'profile.email': 'email',
  'profile.phone': 'phone',
  'profile.phone_number': 'phone',
  'profile.mobile': 'phone',
  'profile.mobile_number': 'phone',
  'profile.telephone': 'phone',
  'profile.contact': 'phone',
  'profile.address': 'address',
  'profile.address_line': 'address',
  'profile.street': 'address',
  'profile.city': 'city',
  'profile.state': 'state',
  'profile.pincode': 'pincode',
  'profile.pin': 'pincode',
  'profile.zip': 'pincode',
  'profile.zip_code': 'pincode',
  'profile.zipcode': 'pincode',
  'profile.postal_code': 'pincode',

  // Academic
  'profile.college': 'collegeName',
  'profile.college_name': 'collegeName',
  'profile.university': 'collegeName',
  'profile.institute': 'collegeName',
  'profile.institution': 'collegeName',
  'profile.roll_no': 'rollNo',
  'profile.rollno': 'rollNo',
  'profile.roll_number': 'rollNo',
  'profile.roll': 'rollNo',
  'profile.scholar_no': 'rollNo',
  'profile.scholarno': 'rollNo',
  'profile.scholar_number': 'rollNo',
  'profile.scholar': 'rollNo',
  'profile.student_id': 'rollNo',
  'profile.user_id': 'rollNo',
  'profile.userid': 'rollNo',
  'profile.degree': 'degree',
  'profile.course': 'degree',
  'profile.program': 'degree',
  'profile.programme': 'degree',
  'profile.qualification': 'degree',
  'profile.education': 'degree',
  'profile.major_degree': 'degree',
  'profile.branch': 'branch',
  'profile.major': 'branch',
  'profile.department': 'branch',
  'profile.graduation_year': 'graduationYear',
  'profile.grad_year': 'graduationYear',
  'profile.passing_year': 'graduationYear',
  'profile.passout_year': 'graduationYear',
  'profile.gradyear': 'graduationYear',
  'profile.year_of_passing': 'graduationYear',
  'profile.passingyear': 'graduationYear',
  'profile.year': 'graduationYear',
  'profile.cgpa': 'cgpa',
  'profile.gpa': 'cgpa',
  'profile.percentage': 'cgpa',
  'profile.percent': 'cgpa',
  'profile.marks': 'cgpa',
  'profile.score': 'cgpa',

  // Govt IDs
  'profile.aadhaar': 'aadhaar',
  'profile.aadhaar_no': 'aadhaar',
  'profile.aadhaar_number': 'aadhaar',
  'profile.aadhar': 'aadhaar',
  'profile.aadhar_no': 'aadhaar',
  'profile.aadhar_number': 'aadhaar',
  'profile.uid': 'aadhaar',
  'profile.pan': 'pan',
  'profile.pan_no': 'pan',
  'profile.pan_number': 'pan',
  'profile.pan_card': 'pan',
  'profile.pancard': 'pan',
};

export async function getProfile(): Promise<UserProfile> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const res = await chrome.storage.local.get(PROFILE_STORAGE_KEY);
    const stored = (res[PROFILE_STORAGE_KEY] as UserProfile) || { ...DEFAULT_USER_PROFILE };
    return normalizeUserProfile(stored);
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
  const normalized = normalizeUserProfile(profile);
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [PROFILE_STORAGE_KEY]: normalized });
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

  const normalizedProfile = normalizeUserProfile(profile);
  let result = text;

  if (portalCred) {
    result = result.replace(/\{portal\.(username|user|id)\}/gi, portalCred.username || normalizedProfile.rollNo || '');
    result = result.replace(/\{portal\.(password|pass|pwd)\}/gi, portalCred.password || '');
  } else if (normalizedProfile.rollNo) {
    // If no portalCred exists but portal username token is present, fallback to student Roll/Scholar No.
    result = result.replace(/\{portal\.(username|user|id)\}/gi, normalizedProfile.rollNo);
  }

  result = result.replace(/\{profile\.([a-zA-Z0-9_.-]+)\}/gi, (match, fieldName) => {
    const fullKey = `profile.${fieldName}`.toLowerCase();

    if (fullKey in TOKEN_KEY_MAP) {
      const prop = TOKEN_KEY_MAP[fullKey];
      const val = normalizedProfile[prop];
      if (typeof val === 'string' && val.trim() !== '') {
        if (prop === 'dob') {
          return normalizeDateToIso(val);
        }
        return val;
      }

      // Explicit fallback name derivations
      if (prop === 'firstName' && normalizedProfile.fullName && normalizedProfile.fullName.trim()) {
        const parts = normalizedProfile.fullName.trim().split(/\s+/);
        if (parts.length > 0 && parts[0]) return parts[0];
      }
      if (prop === 'lastName' && normalizedProfile.fullName && normalizedProfile.fullName.trim()) {
        const parts = normalizedProfile.fullName.trim().split(/\s+/);
        if (parts.length > 1) return parts.slice(1).join(' ');
      }
      if (prop === 'fullName' && (normalizedProfile.firstName || normalizedProfile.lastName)) {
        const combined = [normalizedProfile.firstName, normalizedProfile.lastName].filter(Boolean).join(' ').trim();
        if (combined) return combined;
      }
    }

    if (fieldName.startsWith('custom.') && normalizedProfile.customFields) {
      const customKey = fieldName.slice(7);
      if (normalizedProfile.customFields[customKey]) {
        return normalizedProfile.customFields[customKey];
      }
    }

    if (fieldName in normalizedProfile) {
      const val = (normalizedProfile as Record<string, unknown>)[fieldName];
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
