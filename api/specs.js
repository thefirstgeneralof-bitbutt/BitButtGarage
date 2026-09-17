// POST /api/specs  { prompt, query }  ->  { text, sources }
// Looks a real car up and returns its published figures.
// Grounded in web results wherever the provider (or a search key) allows it.
import { chatWithSearch } from './_provider.js';
import { checkGate } from './_gate.js';

/* A grounded spec lookup is two round trips to the model with a web search in
   between, and that regularly takes 20-40 seconds. Vercel's default cut-off is
   10, which killed every lookup before it could answer — the app just span.
   60 is the ceiling on the Hobby plan. */
export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!checkGate(req)) return res.status(401).json({ error: 'locked', locked: true });
  const { prompt, query } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'missing prompt' });

  const searchQuery = (query || prompt).slice(0, 200) +
    ' specifications horsepower torque top speed 0-60 curb weight';

  try {
    const { text, sources } = await chatWithSearch(prompt, searchQuery, 1200);
    res.status(200).json({ text, sources });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
