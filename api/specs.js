// POST /api/specs  { prompt, query }  ->  { text, sources }
// Looks a real car up and returns its published figures.
// Grounded in web results wherever the provider (or a search key) allows it.
import { chatWithSearch } from './_provider.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
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
