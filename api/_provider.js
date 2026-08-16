// ---------------------------------------------------------------------------
// One adapter, many providers.
//
// The app only ever POSTs {prompt} to /api/mod and /api/specs. Which model
// answers is decided here, by environment variables — no app code changes.
//
//   AI_PROVIDER   openrouter | moonshot | deepseek | openai | compatible | anthropic
//   AI_API_KEY    the key for that provider
//   AI_MODEL      optional model override (each provider has a sane default)
//   AI_BASE_URL   only for AI_PROVIDER=compatible (Groq, Together, Ollama,
//                 an OpenClaw gateway, anything speaking OpenAI chat/completions)
//
// Web search, for the spec lookup:
//   - openrouter  native, via the ":online" suffix. Works with ANY model it hosts,
//                 including DeepSeek and Kimi. Simplest option by far.
//   - moonshot    native $web_search built-in tool.
//   - everything else: we run the search ourselves first and paste the findings
//                 into the prompt. Set SEARCH_PROVIDER=tavily|brave + SEARCH_API_KEY.
//                 With no search key the model answers from memory — fine for
//                 famous cars, unreliable for rare ones.
// ---------------------------------------------------------------------------

const P = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
const KEY = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || '';

const DEFAULTS = {
  // kimi-k2.6, not k3: as of Aug 2026 the documented $web_search round trip
  // returns "400 tokenization failed" on k3. OpenClaw's own kimi-search tool
  // defaults to k2.6 for the same reason.
  moonshot:   { url: 'https://api.moonshot.ai/v1/chat/completions',   model: 'kimi-k2.6' },
  deepseek:   { url: 'https://api.deepseek.com/chat/completions',     model: 'deepseek-v4-flash' },
  openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', model: 'deepseek/deepseek-v4-flash' },
  openai:     { url: 'https://api.openai.com/v1/chat/completions',    model: 'gpt-5.2' },
  compatible: { url: process.env.AI_BASE_URL || '',                   model: 'local' },
  anthropic:  { url: 'https://api.anthropic.com/v1/messages',         model: 'claude-sonnet-4-5-20250929' }
};

function conf() {
  const d = DEFAULTS[P] || DEFAULTS.anthropic;
  return { url: d.url, model: process.env.AI_MODEL || d.model };
}

function assertKey() {
  if (!KEY) throw new Error('AI_API_KEY is not set (or ANTHROPIC_API_KEY for the anthropic provider)');
  if (P === 'compatible' && !process.env.AI_BASE_URL) throw new Error('AI_BASE_URL is required when AI_PROVIDER=compatible');
}

async function post(url, headers, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json' }, headers),
    body: JSON.stringify(body)
  });
  const txt = await r.text();
  if (!r.ok) throw new Error('provider ' + r.status + ': ' + txt.slice(0, 500));
  try { return JSON.parse(txt); } catch (e) { throw new Error('provider sent non-JSON: ' + txt.slice(0, 200)); }
}

// --- plain completion, no tools -------------------------------------------
export async function chat(prompt, maxTokens = 600) {
  assertKey();
  const { url, model } = conf();

  if (P === 'anthropic') {
    const j = await post(url, { 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
      { model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] });
    return (j.content || []).map(b => b.text || '').join('');
  }

  const headers = { authorization: 'Bearer ' + KEY };
  if (P === 'openrouter') {
    headers['HTTP-Referer'] = 'https://garage.bitbutt.com';
    headers['X-Title'] = 'BitButt Garage';
  }
  const j = await post(url, headers, {
    model, max_tokens: maxTokens, temperature: 0.3,
    messages: [{ role: 'user', content: prompt }]
  });
  return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
}

// --- our own search, for providers with none ------------------------------
async function runSearch(query) {
  const sp = (process.env.SEARCH_PROVIDER || '').toLowerCase();
  const sk = process.env.SEARCH_API_KEY || '';
  if (!sp || !sk) return null;

  try {
    if (sp === 'tavily') {
      const j = await post('https://api.tavily.com/search', {},
        { api_key: sk, query, max_results: 5, search_depth: 'basic', include_answer: false });
      return (j.results || []).map(r => ({ title: r.title, url: r.url, text: (r.content || '').slice(0, 1200) }));
    }
    if (sp === 'brave') {
      const r = await fetch('https://api.search.brave.com/res/v1/web/search?count=5&q=' + encodeURIComponent(query),
        { headers: { 'X-Subscription-Token': sk, accept: 'application/json' } });
      if (!r.ok) return null;
      const j = await r.json();
      return ((j.web && j.web.results) || []).map(x => ({
        title: x.title, url: x.url, text: (x.description || '').slice(0, 1200)
      }));
    }
  } catch (e) { return null; }
  return null;
}

// --- completion that should be grounded in real pages ----------------------
export async function chatWithSearch(prompt, searchQuery, maxTokens = 1200) {
  assertKey();
  const { url, model } = conf();

  // 1. OpenRouter — ":online" bolts web search onto whatever model you picked
  if (P === 'openrouter') {
    const j = await post(url, {
      authorization: 'Bearer ' + KEY,
      'HTTP-Referer': 'https://garage.bitbutt.com',
      'X-Title': 'BitButt Garage'
    }, {
      model: model.endsWith(':online') ? model : model + ':online',
      max_tokens: maxTokens, temperature: 0.2,
      messages: [{ role: 'user', content: prompt }]
    });
    const m = (j.choices && j.choices[0] && j.choices[0].message) || {};
    const sources = (m.annotations || [])
      .filter(a => a.type === 'url_citation' && a.url_citation)
      .map(a => a.url_citation.url);
    return { text: m.content || '', sources: [...new Set(sources)].slice(0, 5) };
  }

  // 2. Moonshot — native builtin tool, two round trips.
  //    The model asks to search; we echo its arguments straight back and it
  //    performs the search server-side. We never run a search ourselves.
  if (P === 'moonshot') {
    const messages = [{ role: 'user', content: prompt }];
    const tools = [{ type: 'builtin_function', function: { name: '$web_search' } }];
    for (let hop = 0; hop < 3; hop++) {
      const j = await post(url, { authorization: 'Bearer ' + KEY },
        { model, max_tokens: maxTokens, temperature: 0.2, messages, tools });
      const ch = (j.choices && j.choices[0]) || {};
      const msg = ch.message || {};
      if (ch.finish_reason !== 'tool_calls' || !msg.tool_calls) {
        return { text: msg.content || '', sources: [] };
      }
      messages.push(msg);
      for (const tc of msg.tool_calls) {
        messages.push({
          role: 'tool', tool_call_id: tc.id, name: tc.function.name,
          content: tc.function.arguments           // echoed verbatim — this is the contract
        });
      }
    }
    return { text: '', sources: [] };
  }

  // 3. Everyone else (DeepSeek direct, OpenAI-compatible, local models):
  //    search first, then hand the findings over as context.
  const hits = await runSearch(searchQuery);
  let grounded = prompt;
  if (hits && hits.length) {
    grounded = 'Here are current web search results. Base your answer on them, not on memory.\n\n' +
      hits.map((h, i) => '[' + (i + 1) + '] ' + h.title + ' — ' + h.url + '\n' + h.text).join('\n\n') +
      '\n\n---\n\n' + prompt;
  }
  const text = await chat(grounded, maxTokens);
  return { text, sources: hits ? hits.map(h => h.url).slice(0, 5) : [] };
}

export const providerName = P;
