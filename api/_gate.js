// ---------------------------------------------------------------------------
// The family code.
//
// Set FAMILY_CODE in Vercel → Settings → Environment Variables and the garage
// asks for it once per device. Leave it unset and everything stays open, exactly
// as before — so an empty deploy never locks anybody out by accident.
//
// The code itself is never sent anywhere after the first unlock. The phone keeps
// a derived token instead, and every AI call carries that token. Getting it wrong
// costs the caller three quarters of a second, which is enough to make guessing a
// six-character code pointless.
// ---------------------------------------------------------------------------
import crypto from 'node:crypto';

const RAW = process.env.FAMILY_CODE || '';

/* Kids type on phone keyboards. Case and stray spaces must not matter. */
function normalise(code) {
  return String(code == null ? '' : code).toLowerCase().replace(/\s+/g, '');
}

export function gateRequired() {
  return normalise(RAW).length > 0;
}

export function tokenFor(code) {
  return crypto.createHash('sha256')
    .update(normalise(code) + '|bitbutt-garage-v1')
    .digest('hex');
}

export function checkGate(req) {
  if (!gateRequired()) return true;
  const got = String((req.headers && req.headers['x-bbg-key']) || '');
  const want = tokenFor(RAW);
  if (got.length !== want.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
  } catch (e) {
    return false;
  }
}
