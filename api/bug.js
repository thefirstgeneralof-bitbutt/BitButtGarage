// POST /api/bug
//
// Charlie is the tester. Everything he wants fixed or added to the app leaves
// his phone through here and lands in Dad's inbox — there is no database, so
// the email IS the fix list.
//
//   { reports: [ { kind, what, where, car, said:[], shots:[dataURL] } ], who, lang, vw, vh, ua }
//     -> { ok:true, id, n } | { error }
//
// A single report and a whole list both come through here, so sending the list
// costs one email, not ten.
//
// Vercel → Settings → Environment Variables:
//   MAIL_API_KEY   a Resend API key (re_…)   — required
//   MAIL_TO        where the list goes       — required
//   MAIL_FROM      the sender                — optional
//
// With no key it answers 503 and the app falls back to the phone's own share
// sheet, so a report is never lost to a half-finished setup.
import { checkGate } from './_gate.js';

export const maxDuration = 30;

const KEY = process.env.MAIL_API_KEY || '';
const TO = process.env.MAIL_TO || '';
const FROM = process.env.MAIL_FROM || 'BitButt Garage <onboarding@resend.dev>';

const MAX_REPORTS = 20;
const MAX_SHOTS = 8;              // across the whole email
const MAX_TOTAL_BYTES = 15e6;     // Resend's ceiling is higher; stay well under

function clean(v, n) {
  return String(v == null ? '' : v).replace(/\s+$/, '').slice(0, n);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!checkGate(req)) return res.status(401).json({ error: 'locked', locked: true });

  const b = req.body || {};
  /* One report or a list — both arrive as a list here. */
  const reports = (Array.isArray(b.reports) ? b.reports : [b])
    .filter(r => r && clean(r.what, 2000))
    .slice(0, MAX_REPORTS);
  if (!reports.length) return res.status(400).json({ error: 'nothing to report' });
  if (!KEY || !TO) return res.status(503).json({ error: 'no mailbox set up yet', unconfigured: true });

  const who = clean(b.who, 60) || 'Charlie';
  const attachments = [];
  let bytes = 0;
  const lines = [];

  reports.forEach((r, i) => {
    const kind = r.kind === 'wish' ? 'WISH' : 'FIX';
    lines.push((reports.length > 1 ? i + 1 + '. ' : '') + '[' + kind + '] ' + clean(r.what, 2000));
    if (clean(r.where, 200)) lines.push('   where: ' + clean(r.where, 200));
    if (clean(r.car, 120)) lines.push('   car:   ' + clean(r.car, 120));
    if (Array.isArray(r.said) && r.said.length) {
      lines.push('   he said: ' + r.said.slice(-3).map(s => '"' + clean(s, 300) + '"').join('  '));
    }
    /* Pictures of his own screen. The phone already shrank them. */
    const mine = [];
    for (const s of (Array.isArray(r.shots) ? r.shots : [])) {
      if (attachments.length >= MAX_SHOTS) break;
      const m = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(s || ''));
      if (!m) continue;
      const size = m[2].length * 0.75;
      if (bytes + size > MAX_TOTAL_BYTES) continue;
      bytes += size;
      const ext = m[1] === 'png' ? 'png' : m[1] === 'webp' ? 'webp' : 'jpg';
      const name = (reports.length > 1 ? i + 1 + '-' : '') + 'screen-' + (mine.length + 1) + '.' + ext;
      attachments.push({ filename: name, content: m[2] });
      mine.push(name);
    }
    if (mine.length) lines.push('   pictures: ' + mine.join(', '));
    lines.push('');
  });

  const head = reports.length > 1
    ? who + ' sent ' + reports.length + ' things from the garage'
    : who + ' found something';
  const subject = 'BitButt Garage — ' + (reports.length > 1
    ? reports.length + ' from ' + who
    : (clean(reports[0].what, 70) + (clean(reports[0].what, 2000).length > 70 ? '…' : '')));

  const text = [head, ''].concat(lines).concat([
    '--',
    'Phone:  ' + clean(b.ua, 300),
    'Screen: ' + clean(b.vw, 6) + '×' + clean(b.vh, 6) + ', language ' + clean(b.lang, 8),
    'Sent:   ' + new Date().toISOString()
  ]).join('\n');

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + KEY },
      body: JSON.stringify({
        from: FROM,
        to: TO.split(',').map(s => s.trim()).filter(Boolean),
        subject,
        text,
        attachments
      })
    });
    const txt = await r.text();
    if (!r.ok) return res.status(502).json({ error: 'post office said ' + r.status + ': ' + txt.slice(0, 200) });
    let id = '';
    try { id = (JSON.parse(txt) || {}).id || ''; } catch (e) {}
    res.status(200).json({ ok: true, id, n: reports.length });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
