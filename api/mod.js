// POST /api/mod  { prompt }  ->  { text }
// Invents realistic stat changes for a modification the user typed.
// No web search needed — this is judgement, not lookup.
import { chat } from './_provider.js';
import { checkGate } from './_gate.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!checkGate(req)) return res.status(401).json({ error: 'locked', locked: true });
  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'missing prompt' });

  try {
    const text = await chat(prompt, 600);
    res.status(200).json({ text });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
