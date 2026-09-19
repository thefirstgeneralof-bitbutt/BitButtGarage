// POST /api/chat
//
// Wrench (Polish: Mechanik) — the pit-lane engineer a kid can talk to about a car.
//
//   { mode:'chat', lang:'pl'|'en', car:{...} | null, messages:[{role:'user'|'assistant', content}] }
//     -> { text, lang, proposals:[{key,value,unit,why,source}], learn:boolean, sources:[], cost }
//
//   { mode:'translate', to:'pl'|'en', text }
//     -> { text, cost }
//
// Money. There is no per-key spend cap at Moonshot and no database here, so the
// cap lives on the phone (see the client: $3/day, stored in localStorage) and
// this endpoint makes sure a single request can never cost more than a few
// cents: short history, small max_tokens, at most two searches. `cost` is our
// own estimate from the token counts and the prices below, and the client adds
// it to the day's total. Override the prices with env vars if Moonshot changes
// theirs: AI_PRICE_IN, AI_PRICE_OUT (USD per million tokens), AI_PRICE_SEARCH
// (USD per search call).
import { converse } from './_provider.js';
import { checkGate } from './_gate.js';

export const maxDuration = 60;

const PRICE_IN = Number(process.env.AI_PRICE_IN || 0.6);        // $/M input tokens
const PRICE_OUT = Number(process.env.AI_PRICE_OUT || 2.5);      // $/M output tokens
const PRICE_SEARCH = Number(process.env.AI_PRICE_SEARCH || 0.01); // $/search

const STAT_UNITS = {
  hp: 'hp (mechanical horsepower; 1 PS = 0.986 hp)',
  torque: 'lb-ft',
  top: 'mph',
  zero: 'seconds 0-60 mph',
  weight: 'lb, curb weight',
  grip: 'g, peak lateral',
  downforce: 'lb'
};

function costOf(u) {
  return +((u.input * PRICE_IN + u.output * PRICE_OUT) / 1e6 + u.searches * PRICE_SEARCH).toFixed(5);
}

function carBlock(c) {
  if (!c || !c.model) return 'No car is open. The kid is asking about the garage in general.';
  const lines = [];
  for (const k of Object.keys(STAT_UNITS)) {
    const v = c.stats && c.stats[k];
    let flag = '';
    if (c.verified && c.verified[k]) flag = ' (already verified by the kid, source: ' + c.verified[k] + ')';
    else if ((c.est || []).includes(k)) flag = ' (ESTIMATE — nobody publishes this)';
    lines.push('  ' + k + ': ' + (v == null ? 'NOT PUBLISHED' : v) + ' ' + STAT_UNITS[k] + flag);
  }
  return 'Car card open right now: ' + [c.year, c.make, c.model].filter(Boolean).join(' ') +
    (c.engine ? ' — engine: ' + c.engine : '') + '\n' + lines.join('\n') +
    (c.note ? '\nCard note: ' + c.note : '') +
    (c.srcName ? '\nCard source: ' + c.srcName + (c.srcUrl ? ' ' + c.srcUrl : '') : '') +
    (c.builtin ? '\nThis is one of the app\'s eight built-in cars; its figures were checked by the developer, but the US brochure was used where markets differ.' : '\nThis car was added by the kid or looked up by AI; treat its figures with more suspicion.');
}

function systemPrompt(lang, car) {
  const L = lang === 'pl' ? 'Polish' : 'English';
  return [
    'You are Wrench (in Polish: Mechanik), the pit-lane engineer inside BitButt Garage, a car app used by a young enthusiast, roughly 9 to 13 years old, who knows cars well and hates being talked down to.',
    'Voice: a friendly pit-lane engineer. Short sentences. Concrete numbers. Confident when sure, honest when not. No emoji, no markdown, no bullet lists. About 40 to 120 words.',
    'LANGUAGE: answer ONLY in ' + L + '. Never mix languages in one answer. Car names, brands and units stay as they are.',
    'SCOPE: cars, engines, motorsport, tuning, driving, and this app. If asked about homework, school subjects, or anything else unrelated to cars: reply with one friendly line saying that in here you are the mechanic and the garage is for cars, mention that BitButt Learn is the place for that, and set "learn": true. Do not answer the homework.',
    'FACTS: when a question needs a fact you are not certain of, or a figure that differs between markets (US vs Europe/Japan, hp vs PS, mph vs km/h, US brochure rounding), search the web. Prefer the manufacturer\'s home-market or global spec sheet over a US brochure. Say which source you used. If you searched and still are not sure, say so.',
    'FIXES: the car card figures are below with their units. If a source shows a card figure is wrong or came from the wrong market, propose a fix in "proposals" — value converted to the card\'s unit, one short reason, and the source URL. Never propose a value you did not see in a source. Never propose for a NOT PUBLISHED figure unless a manufacturer publishes it. Never propose changes to figures already verified by the kid unless you are sure they are wrong. The kid approves or skips every proposal; you never change anything yourself.',
    'FORMAT: reply with ONLY minified JSON, no prose around it, no code fences: {"answer":"...","proposals":[{"key":"hp|torque|top|zero|weight|grip|downforce","value":number,"unit":"card unit","why":"one short sentence","source":"url"}],"learn":false,"sources":["url"]}',
    '',
    carBlock(car)
  ].join('\n');
}

function parseLoose(t) {
  const s = String(t || '').replace(/```json|```/g, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
}

const KEYS = Object.keys(STAT_UNITS);
function cleanProposals(p) {
  if (!Array.isArray(p)) return [];
  return p.filter(x => x && KEYS.includes(x.key) && isFinite(Number(x.value)) && /^https?:\/\//.test(String(x.source || '')))
    .slice(0, 4)
    .map(x => ({ key: x.key, value: Number(x.value), unit: String(x.unit || '').slice(0, 12), why: String(x.why || '').slice(0, 220), source: String(x.source).slice(0, 300) }));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!checkGate(req)) return res.status(401).json({ error: 'locked', locked: true });
  const b = req.body || {};
  const lang = b.lang === 'pl' ? 'pl' : 'en';

  try {
    if (b.mode === 'translate') {
      const to = b.to === 'pl' ? 'Polish' : 'English';
      const text = String(b.text || '').slice(0, 2000);
      if (!text) return res.status(400).json({ error: 'nothing to translate' });
      const r = await converse([
        { role: 'system', content: 'Translate the user\'s text into ' + to + '. Keep car names, brands, numbers and units exactly as they are. Output only the translation, nothing else.' },
        { role: 'user', content: text }
      ], { search: false, maxTokens: 700 });
      return res.status(200).json({ text: r.text.trim(), cost: costOf(r.usage) });
    }

    const history = (Array.isArray(b.messages) ? b.messages : [])
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && m.content)
      .slice(-8)
      .map(m => ({ role: m.role, content: String(m.content).slice(0, 1200) }));
    if (!history.length || history[history.length - 1].role !== 'user') {
      return res.status(400).json({ error: 'missing question' });
    }

    const messages = [{ role: 'system', content: systemPrompt(lang, b.car) }].concat(history);
    const r = await converse(messages, { search: true, maxTokens: 900, maxHops: 3 });
    const j = parseLoose(r.text) || {};
    const answer = String(j.answer || r.text || '').trim();
    if (!answer) return res.status(502).json({ error: 'the mechanic said nothing — try again' });

    const sources = [].concat(Array.isArray(j.sources) ? j.sources : [], r.sources || [])
      .filter(s => /^https?:\/\//.test(String(s))).slice(0, 5);
    res.status(200).json({
      text: answer,
      lang,
      proposals: cleanProposals(j.proposals),
      learn: !!j.learn,
      sources: [...new Set(sources)],
      cost: costOf(r.usage),
      usage: r.usage
    });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
