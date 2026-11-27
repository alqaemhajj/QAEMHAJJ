import QRCode from 'qrcode';

/**
 * Standard RFC 6238 / RFC 4226 TOTP (Time-based One-Time Password) engine
 * using Web Crypto API (HMAC-SHA1, 6 digits, 30-second time step).
 * 100% compatible with Google Authenticator, Microsoft Authenticator, Authy, and Apple Passwords.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_ISSUER = 'قافلة القائم';

/**
 * Normalizes Eastern Arabic (٠-٩) and Persian (۰-۹) digits to ASCII (0-9) and strips whitespace.
 */
export function normalizeOtpDigits(raw: string): string {
  return (raw || '')
    .trim()
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, '');
}

/**
 * Generates a cryptographically strong 160-bit Base32 secret (32 Base32 chars).
 */
export function generateTotpSecret(byteLength = 20): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);

  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Formats a Base32 secret into 4-character readable groups for manual entry.
 */
export function formatTotpSecretForDisplay(secret: string): string {
  const clean = (secret || '').replace(/[^A-Z2-7]/gi, '').toUpperCase();
  return clean.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Decodes a Base32 string into raw bytes.
 */
function base32ToBytes(secret: string): Uint8Array {
  const clean = (secret || '').replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return new Uint8Array(bytes);
}

/**
 * Constant-time string comparison to avoid timing side channels.
 */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Computes a 6-digit HOTP/TOTP code for a specific counter value using Web Crypto HMAC-SHA1.
 */
async function computeHotp(secretBytes: Uint8Array, counter: number): Promise<string> {
  const counterBytes = new Uint8Array(8);
  let tmp = counter;
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = tmp & 0xff;
    tmp = Math.floor(tmp / 256);
  }

  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes as unknown as BufferSource,
    { name: 'HMAC', hash: { name: 'SHA-1' } },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, counterBytes);
  const hmac = new Uint8Array(signature);

  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binary % Math.pow(10, TOTP_DIGITS)).padStart(TOTP_DIGITS, '0');
}

/**
 * Generates the current 6-digit TOTP code for a given Base32 secret.
 */
export async function generateTotpCode(secret: string, timestampMs = Date.now()): Promise<string> {
  const secretBytes = base32ToBytes(secret);
  const counter = Math.floor(timestampMs / 1000 / TOTP_STEP_SECONDS);
  return computeHotp(secretBytes, counter);
}

/**
 * Verifies a user-supplied 6-digit TOTP code against the stored Base32 secret.
 * Allows ±1 time step (±30s) drift tolerance for minor mobile device clock offsets.
 */
export async function verifyTotpCode(
  secret: string,
  rawToken: string,
  windowSteps = 1
): Promise<boolean> {
  const token = normalizeOtpDigits(rawToken);
  if (token.length !== TOTP_DIGITS) return false;
  if (!secret || secret.trim().length < 16) return false;

  const secretBytes = base32ToBytes(secret);
  if (secretBytes.length < 10) return false;

  const currentCounter = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
  for (let delta = -windowSteps; delta <= windowSteps; delta++) {
    const expected = await computeHotp(secretBytes, currentCounter + delta);
    if (constantTimeEquals(expected, token)) {
      return true;
    }
  }
  return false;
}

/**
 * Builds the standard otpauth:// URI for Google Authenticator / Microsoft Authenticator.
 */
export function buildOtpAuthUri(accountEmail: string, secret: string, issuer = TOTP_ISSUER): string {
  const cleanAccount = (accountEmail || 'staff@alqaemhajj.com').trim();
  const cleanSecret = (secret || '').replace(/\s+/g, '').toUpperCase();
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(cleanAccount)}`;
  const params = new URLSearchParams({
    secret: cleanSecret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/**
 * Generates a high-contrast QR Code PNG Data URL for the otpauth URI.
 */
export async function generateTotpQrDataUrl(otpauthUri: string): Promise<string> {
  return QRCode.toDataURL(otpauthUri, {
    width: 240,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0F172A',
      light: '#FFFFFF',
    },
  });
}
