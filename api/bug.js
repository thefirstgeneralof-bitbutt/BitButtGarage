// POST /api/bug
//
// Charlie is the test driver. Everything he wants fixed or added leaves his
// phone through here and becomes a GitHub issue on the garage's own repo — so
// Dad gets the notification and Claude can read the list and fix straight from
// it. There is no database anywhere in this app; the issue list IS the fix list.
//
//   { reports: [ { kind, what, where, car, said:[], shots:[dataURL] } ], who, lang, vw, vh, ua }
//     -> { ok:true, n, urls:[] } | { error }
//
// Pictures of his screen cannot be attached to an issue through the API, so
// they are committed to a side branch (never main, so the site is not
// redeployed by a screenshot) and linked into the issue body, where GitHub
// renders them inline.
//
// Vercel → Settings → Environment Variables:
//   GH_TOKEN    a fine-grained token for this repo, with
//               Contents: read & write  and  Issues: read & write   — required
//   GH_REPO     owner/name                                          — optional
//   GH_BRANCH   where the pictures live                             — optional
//
// With no token it answers 503 and the app falls back to the phone's own share
// sheet, so a report is never lost to a half-finished setup.
import { checkGate } from './_gate.js';

export const maxDuration = 60;

const TOKEN = process.env.GH_TOKEN || '';
const REPO = process.env.GH_REPO || 'thefirstgeneralof-bitbutt/BitButtGarage';
const BRANCH = process.env.GH_BRANCH || 'fixlist';
const API = 'https://api.github.com';

const MAX_REPORTS = 20;
const MAX_SHOTS = 3;
const MAX_SHOT_BYTES = 4e6;

function clean(v, n) {
  return String(v == null ? '' : v).replace(/\s+$/, '').slice(0, n);
}

async function gh(path, opts = {}) {
  const r = await fetch(API + path, {
    ...opts,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: 'Bearer ' + TOKEN,
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
      ...(opts.headers || {})
    }
  });
  const txt = await r.text();
  let json = null;
  try { json = JSON.parse(txt); } catch (e) {}
  return { ok: r.ok, status: r.status, json, txt };
}

/* The pictures live on their own branch. It is made once, from whatever main
   points at, and never merged back. */
async function ensureBranch() {
  const got = await gh('/repos/' + REPO + '/git/ref/heads/' + BRANCH);
  if (got.ok) return true;
  const main = await gh('/repos/' + REPO + '/git/ref/heads/main');
  if (!main.ok) return false;
  const made = await gh('/repos/' + REPO + '/git/refs', {
    method: 'POST',
    body: JSON.stringify({ ref: 'refs/heads/' + BRANCH, sha: main.json.object.sha })
  });
  return made.ok;
}

async function putShot(name, base64) {
  const r = await gh('/repos/' + REPO + '/contents/' + encodeURI(name), {
    method: 'PUT',
    body: JSON.stringify({
      message: 'screenshot from the garage',
      content: base64,
      branch: BRANCH
    })
  });
  if (!r.ok) return null;
  return 'https://raw.githubusercontent.com/' + REPO + '/' + BRANCH + '/' + encodeURI(name);
}

function issueBody(r, meta, shots) {
  const lines = ['> ' + clean(r.what, 2000), ''];
  const facts = [];
  if (clean(r.where, 200)) facts.push('**Where:** ' + clean(r.where, 200));
  if (clean(r.car, 120)) facts.push('**Car:** ' + clean(r.car, 120));
  facts.push('**Reported by:** ' + meta.who);
  if (facts.length) lines.push(facts.join('  \n'), '');
  if (Array.isArray(r.said) && r.said.length) {
    lines.push('**In his own words**', '');
    for (const s of r.said.slice(-3)) lines.push('- "' + clean(s, 300) + '"');
    lines.push('');
  }
  for (const u of shots) lines.push('![screenshot](' + u + ')', '');
  lines.push(
    '<sub>' + meta.ua + ' · ' + meta.vw + '×' + meta.vh + ' · language ' + meta.lang +
    ' · ' + new Date().toISOString() + '</sub>'
  );
  return lines.join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!checkGate(req)) return res.status(401).json({ error: 'locked', locked: true });

  const b = req.body || {};
  const reports = (Array.isArray(b.reports) ? b.reports : [b])
    .filter(r => r && clean(r.what, 2000))
    .slice(0, MAX_REPORTS);
  if (!reports.length) return res.status(400).json({ error: 'nothing to report' });
  if (!TOKEN) return res.status(503).json({ error: 'no fix list set up yet', unconfigured: true });

  const meta = {
    who: clean(b.who, 60) || 'Charlie',
    lang: clean(b.lang, 8),
    vw: clean(b.vw, 6),
    vh: clean(b.vh, 6),
    ua: clean(b.ua, 300)
  };

  try {
    const wantsShots = reports.some(r => Array.isArray(r.shots) && r.shots.length);
    const branchReady = wantsShots ? await ensureBranch() : false;
    const urls = [];

    for (const r of reports) {
      const shots = [];
      if (branchReady) {
        let i = 0;
        for (const s of (Array.isArray(r.shots) ? r.shots : []).slice(0, MAX_SHOTS)) {
          const m = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(s || ''));
          if (!m || m[2].length * 0.75 > MAX_SHOT_BYTES) continue;
          const ext = m[1] === 'png' ? 'png' : m[1] === 'webp' ? 'webp' : 'jpg';
          const name = 'shots/' + new Date().toISOString().slice(0, 10) + '-' +
            Math.random().toString(36).slice(2, 8) + '-' + ++i + '.' + ext;
          const url = await putShot(name, m[2]);
          if (url) shots.push(url);
        }
      }

      const kind = r.kind === 'wish' ? 'WISH' : 'FIX';
      const what = clean(r.what, 2000);
      const title = '[' + kind + '] ' + (what.length > 80 ? what.slice(0, 77) + '…' : what);
      const payload = { title, body: issueBody(r, meta, shots) };

      let made = await gh('/repos/' + REPO + '/issues', {
        method: 'POST',
        body: JSON.stringify({ ...payload, labels: [kind.toLowerCase(), 'from-the-garage'] })
      });
      /* A repo without those labels yet must not swallow the report. */
      if (!made.ok) {
        made = await gh('/repos/' + REPO + '/issues', { method: 'POST', body: JSON.stringify(payload) });
      }
      if (!made.ok) {
        return res.status(502).json({
          error: 'github said ' + made.status + ': ' + clean(made.txt, 200),
          filed: urls.length
        });
      }
      urls.push(made.json.html_url);
    }

    res.status(200).json({ ok: true, n: urls.length, urls });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
