// GET  /api/gate            -> { required: true|false }
// POST /api/gate  { code }  -> { token } | 401
import { gateRequired, tokenFor } from './_gate.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ required: gateRequired() });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }
  if (!gateRequired()) {
    return res.status(200).json({ token: 'open' });
  }

  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'missing code' });

  const got = tokenFor(code);
  if (got !== tokenFor(process.env.FAMILY_CODE)) {
    /* slow the guesser down */
    await new Promise(function (r) { setTimeout(r, 750); });
    return res.status(401).json({ error: 'that code is not right' });
  }
  return res.status(200).json({ token: got });
}
