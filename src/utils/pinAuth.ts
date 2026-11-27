/**
 * Cryptographic Password & PIN Authentication Utilities
 * - Uses PBKDF2-HMAC-SHA256 (100,000 iterations + 128-bit random salt) via Web Crypto API for all new passwords.
 * - Preserves backward-compatible SHA-256 verification for legacy staff accounts until they update their password.
 * - Normalizes Eastern Arabic (٠-٩) and Persian (۰-۹) digits cleanly across mobile & desktop keyboards.
 */

export const MASTER_DEFAULT_PIN_HASH =
  '3f03b51688d048d0870949d2110c9d784762391696a40a50f00f07f90f230589';

const PBKDF2_PREFIX = 'pbkdf2$';
const PBKDF2_ITERATIONS = 100_000;

/**
 * Converts Eastern Arabic (٠-٩) and Persian (۰-۹) digits to standard ASCII (0-9)
 * and strips invisible directional marks.
 */
export const normalizePinInput = (pin: string): string => {
  if (!pin) return '';
  return pin
    .trim()
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
};

const toEasternArabicDigits = (asciiPin: string): string => {
  return asciiPin.replace(/[0-9]/g, (d) => String.fromCharCode(0x0660 + Number(d)));
};

const toPersianDigits = (asciiPin: string): string => {
  return asciiPin.replace(/[0-9]/g, (d) => String.fromCharCode(0x06f0 + Number(d)));
};

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const clean = (hex || '').trim();
  const arr = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16) || 0;
  }
  return arr;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export const sha256Hex = async (value: string): Promise<string> => {
  const msgUint8 = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  return bytesToHex(new Uint8Array(hashBuffer));
};

async function derivePbkdf2Hex(
  password: string,
  saltBytes: Uint8Array,
  iterations: number
): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(derivedBits));
}

/**
 * Hashes a staff/admin password using PBKDF2-HMAC-SHA256 with a fresh 128-bit cryptographic salt.
 */
export const hashPasswordSecure = async (rawPassword: string): Promise<string> => {
  const normalized = normalizePinInput(rawPassword);
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const derivedHex = await derivePbkdf2Hex(normalized, saltBytes, PBKDF2_ITERATIONS);
  return `${PBKDF2_PREFIX}${PBKDF2_ITERATIONS}$${bytesToHex(saltBytes)}$${derivedHex}`;
};

/**
 * Canonical password/PIN hashing helper (delegates to salted PBKDF2-SHA256).
 */
export const hashPIN = async (pin: string): Promise<string> => {
  return hashPasswordSecure(pin);
};

/**
 * Verifies a password/PIN against either a salted PBKDF2-SHA256 hash or a legacy SHA-256 hash.
 */
export const verifyPasswordSecure = async (
  storedHash: string | undefined | null,
  rawInput: string
): Promise<boolean> => {
  if (!storedHash) return false;
  const cleanStored = storedHash.trim();
  const trimmedInput = (rawInput || '').trim();
  if (!cleanStored || !trimmedInput) return false;

  const normalizedAscii = normalizePinInput(trimmedInput);
  if (!normalizedAscii) return false;

  // 1. Modern salted PBKDF2-HMAC-SHA256 format: pbkdf2$<iterations>$<saltHex>$<derivedHex>
  if (cleanStored.startsWith(PBKDF2_PREFIX)) {
    const parts = cleanStored.split('$');
    if (parts.length !== 4) return false;
    const iterations = Number(parts[1]);
    const saltHex = parts[2];
    const expectedHex = parts[3].toLowerCase();
    if (!Number.isFinite(iterations) || iterations < 1000 || !saltHex || !expectedHex) {
      return false;
    }
    const saltBytes = hexToBytes(saltHex);
    const derivedAscii = (await derivePbkdf2Hex(normalizedAscii, saltBytes, iterations)).toLowerCase();
    if (constantTimeEqual(derivedAscii, expectedHex)) return true;
    if (trimmedInput !== normalizedAscii) {
      const derivedRaw = (await derivePbkdf2Hex(trimmedInput, saltBytes, iterations)).toLowerCase();
      if (constantTimeEqual(derivedRaw, expectedHex)) return true;
    }
    return false;
  }

  // 2. Legacy SHA-256 verification (for pre-existing staff records prior to password upgrade)
  const isHexSha256 = /^[a-f0-9]{64}$/i.test(cleanStored);
  if (isHexSha256) {
    const candidateStrings = Array.from(
      new Set([
        normalizedAscii,
        trimmedInput,
        toEasternArabicDigits(normalizedAscii),
        toPersianDigits(normalizedAscii),
      ])
    );
    const candidateHashes = await Promise.all(
      candidateStrings.map((candidate) => sha256Hex(candidate))
    );
    const lowerStored = cleanStored.toLowerCase();
    return candidateHashes.some((h) => constantTimeEqual(h.toLowerCase(), lowerStored));
  }

  // 3. Legacy plain-text fallback (constant-time)
  return (
    constantTimeEqual(cleanStored, normalizedAscii) ||
    constantTimeEqual(normalizePinInput(cleanStored), normalizedAscii)
  );
};

export const verifyPinMatch = verifyPasswordSecure;

export interface PasswordStrengthReport {
  isValid: boolean;
  score: number; // 0 to 5
  checks: {
    minLength: boolean;
    hasUpper: boolean;
    hasLower: boolean;
    hasDigit: boolean;
    hasSpecial: boolean;
  };
  errors: string[];
}

/**
 * Validates strong password policy for mandatory first-login & voluntary password changes.
 */
export function validateStrongPassword(rawPassword: string): PasswordStrengthReport {
  const pwd = normalizePinInput(rawPassword);
  const checks = {
    minLength: pwd.length >= 8,
    hasUpper: /[A-Z]/.test(pwd),
    hasLower: /[a-z]/.test(pwd),
    hasDigit: /[0-9]/.test(pwd),
    hasSpecial: /[^A-Za-z0-9\s]/.test(pwd),
  };

  const errors: string[] = [];
  if (!checks.minLength) errors.push('يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.');
  if (!checks.hasUpper) errors.push('يجب أن تحتوي على حرف إنجليزي كبير واحد على الأقل (A-Z).');
  if (!checks.hasLower) errors.push('يجب أن تحتوي على حرف إنجليزي صغير واحد على الأقل (a-z).');
  if (!checks.hasDigit) errors.push('يجب أن تحتوي على رقم واحد على الأقل (0-9).');
  if (!checks.hasSpecial) errors.push('يجب أن تحتوي على رمز خاص واحد على الأقل (مثل @ # $ % ! & *).');

  const score = Object.values(checks).filter(Boolean).length;
  return {
    isValid: errors.length === 0,
    score,
    checks,
    errors,
  };
}

/**
 * Generates a cryptographically strong temporary password (12 chars) for new staff accounts.
 */
export function generateTemporaryPassword(length = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '@#$%&*!?';
  const all = upper + lower + digits + symbols;

  const pick = (pool: string) => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return pool[buf[0] % pool.length];
  };

  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < length) {
    chars.push(pick(all));
  }

  // Fisher-Yates shuffle using crypto.getRandomValues
  for (let i = chars.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}
