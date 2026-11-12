/**
 * VaultPilot - Credential Extractor & Zero-Egress Redactor
 * Safely extracts portal login credentials locally from user chat prompts
 * and sanitizes the prompt before any payload is sent to Gemini.
 */

export interface ExtractedCredentials {
  username?: string;
  password?: string;
  hasCredentials: boolean;
  sanitizedCommand: string;
}

// Regex patterns to capture user credentials from conversational prompts
const USERNAME_REGEX =
  /\b(?:my\s+)?(?:id|username|user(?:name)?|scholar(?:\s*id|\s*no)?|roll(?:\s*no|\s*number)?)\s*(?:is|:|=)\s*([a-zA-Z0-9_.-]+)/i;

const PASSWORD_REGEX =
  /\b(?:my\s+)?(?:password|pass|pwd)\s*(?:is|:|=)\s*([^\s,;]+)/i;

export function extractCredentialsFromCommand(command: string): ExtractedCredentials {
  if (!command || typeof command !== 'string') {
    return { hasCredentials: false, sanitizedCommand: command || '' };
  }

  let username: string | undefined;
  let password: string | undefined;

  const userMatch = command.match(USERNAME_REGEX);
  if (userMatch && userMatch[1]) {
    username = userMatch[1].trim();
  }

  const passMatch = command.match(PASSWORD_REGEX);
  if (passMatch && passMatch[1]) {
    password = passMatch[1].trim();
  }

  const hasCredentials = Boolean(username || password);
  let sanitizedCommand = command;

  // Mask the real password in the outgoing command to prevent LLM egress
  if (password) {
    sanitizedCommand = sanitizedCommand.replace(
      new RegExp(`(\\b(?:password|pass|pwd)\\s*(?:is|:|=)\\s*)\\Q${password}\\E`, 'gi'),
      '$1[SECURE_CREDENTIAL_MASKED]'
    );

    // Fallback direct string replacement if regex special chars exist
    if (sanitizedCommand.includes(password)) {
      sanitizedCommand = sanitizedCommand.split(password).join('[SECURE_CREDENTIAL_MASKED]');
    }
  }

  return {
    username,
    password,
    hasCredentials,
    sanitizedCommand,
  };
}

export function humanizeToken(token: string): string {
  const clean = token.replace(/[{}]/g, '');
  const parts = clean.split('.');
  const key = parts[parts.length - 1];

  const map: Record<string, string> = {
    full_name: 'Full Name',
    fullname: 'Full Name',
    dob: 'Date of Birth',
    date_of_birth: 'Date of Birth',
    gender: 'Gender',
    category: 'Category / Caste',
    roll_no: 'Roll / Scholar Number',
    rollno: 'Roll / Scholar Number',
    aadhaar: 'Aadhaar UID Number',
    pan: 'PAN Card Number',
    cgpa: 'CGPA',
    college: 'College Name',
    degree: 'Degree',
    branch: 'Branch / Stream',
    email: 'Email Address',
    phone: 'Phone Number',
    username: 'Portal User ID',
    password: 'Portal Password',
  };

  if (map[key.toLowerCase()]) {
    return map[key.toLowerCase()];
  }

  return key
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
