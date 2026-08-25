import { TOTP, Secret } from 'otpauth';
import { randomBytes, createHash } from 'node:crypto';

const ISSUER = 'Chance Publishers Portal';

export function generateSecret(): Secret {
  return new Secret({ size: 20 });
}

function makeTotp(email: string, base32Secret: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(base32Secret),
  });
}

export function otpauthUri(email: string, base32Secret: string): string {
  return makeTotp(email, base32Secret).toString();
}

// window:1 tolerates the code from one 30s step before/after, covering
// normal clock drift between the server and the user's phone.
export function verifyTotp(email: string, base32Secret: string, token: string): boolean {
  const cleaned = token.replace(/\s/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;
  const delta = makeTotp(email, base32Secret).validate({ token: cleaned, window: 1 });
  return delta !== null;
}

function hashBackupCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

// Ten codes like "XXXX-XXXX", uppercase hex, easy to read and type once.
export function generateBackupCodes(): { plain: string[]; hashed: string[] } {
  const plain: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < 10; i++) {
    const raw = randomBytes(5).toString('hex').toUpperCase();
    const code = `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
    plain.push(code);
    hashed.push(hashBackupCode(code));
  }
  return { plain, hashed };
}

// Returns the remaining hashed codes with the matched one removed (so each
// backup code works exactly once), or null if the code didn't match any.
export function consumeBackupCode(hashedCodes: string[], candidate: string): string[] | null {
  const hashedCandidate = hashBackupCode(candidate.trim().toUpperCase());
  const index = hashedCodes.indexOf(hashedCandidate);
  if (index === -1) return null;
  return [...hashedCodes.slice(0, index), ...hashedCodes.slice(index + 1)];
}
