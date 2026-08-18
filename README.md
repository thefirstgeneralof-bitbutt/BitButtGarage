# BitButt Garage — deploy package

Spot a car, add it with your own photos, let AI find its real specs, then build it.
Successor to *Car Tuner Build Terminal*. Same eight legends, same 18 tuning rules,
same maths — rebuilt as one readable file with your own garage on top.

## What's in here

| File | What it is |
|---|---|
| `index.html` | The whole app. No build step, no framework, no bundler. ~100 KB. |
| `api/_provider.js` | The AI adapter. Swap providers with environment variables — see below. |
| `api/mod.js` | Invents realistic stat changes for a mod you typed. |
| `api/specs.js` | Looks a real car up on the web and returns its published figures. |
| `package.json` | Just `"type": "module"`, so the functions can import the adapter. |
| `manifest.json`, `icon-192.png`, `icon-512.png` | Home-screen app icon and PWA config. |

> **Deployed 2026-08-16** to https://bitbutt-garage.vercel.app (Vercel team TFG-pol,
> repo `thefirstgeneralof-bitbutt/BitButtGarage`). There is deliberately **no
> `vercel.json`** — Vercel auto-detects `api/*.js` as functions, and an earlier config
> file only got in the way. If a spec lookup ever times out, raise the limit in
> Vercel → Settings → Functions rather than adding the file back.

## Deploy

1. Push this `build/` folder to a new GitHub repo.
2. vercel.com → **New Project** → import that repo. Framework preset: **Other**. Deploy.
3. Project → Settings → **Environment Variables** → set your AI provider
   (see *Choosing the AI* below). The shortest version:
   `AI_PROVIDER=openrouter` and `AI_API_KEY=sk-or-...`
4. Deployments → **Redeploy** so the functions pick the key up.
5. Project → Settings → **Domains** → add `garage.bitbutt.com`, then add
   `bitbuttgarage.bitbutt.com` and set it to redirect to the first one.
   Vercel prints the CNAME to create at your DNS host.
6. On the iPhone, open the URL in **Safari** → Share → **Add to Home Screen**.
   It opens full screen with no browser bar, and the camera button works from there.

> Reminder from your empire map: **bitbutt.com expires 2027-03-06 and auto-renew is OFF.**

## What's new versus the old terminal

**Search.** One box over the whole garage — make, model, year, horsepower, your notes,
where you saw it, your tags. Filters as you type. When nothing matches, it offers to go
find the car on the web instead.

**Your own cars.** Three ways to get a picture: the camera, your photo library, or
*Search the web* — one overlay with Wikimedia Commons results you tap to add, links out to
Google/Bing/DuckDuckGo images, and a paste-an-address box for anything you find there.
Several photos per car, with one as the cover.
Category (Spotted / Wishlist / Owned / Dream), your own tags, a favourite star, free
notes, the place, the date, the asking price and the listing link. Location is **never**
taken automatically — press *Use my location now* and only then does the app ask the phone.
(iPhone Safari strips GPS out of uploaded photos, so reading the picture wouldn't work
anyway.) You can turn on automatic suggestion in Settings if you'd rather.

**AI, two ways.**
- *Find it with AI* — from the search box, when the car isn't in your garage yet.
- *AI, fill the specs* — inside the add form, once you've typed a name.

Both go through `api/specs.js`, which searches the web so the numbers come from real pages
rather than the model's memory. Sources are kept on the car and shown under Field Notes.
**Always check them** — published figures disagree with each other more than you'd think,
and a cheap model reading a bad page is still reading a bad page.

**Cars you add are fully tunable.** Your photo is the face of the card and the hero on
the tuning screen; the shape you pick (coupe, supercar, SUV, van…) drives the animated
silhouette underneath, so mods still show visually — the car drops on coilovers, gets
fat on wider tyres, grows a wing.

**Controls.** ⚙ tab: accent and gain/loss colours, dark or light, comfortable or compact,
animation on/off, which stats appear and in what order (the top three are the big
numbers), and units — imperial, metric, or **both side by side**.

## Locking it (the family code)

The site is public, but there is no server holding anybody's garage — every car,
photo and build lives in the browser that made it. A stranger who finds the URL sees
an empty garage with the eight built-ins, and cannot see or touch yours.

What *is* worth protecting is the AI, because those calls come out of your account.
So the lock sits in front of the whole app and in front of both AI endpoints.

Set one variable in Vercel → Settings → Environment Variables:

```
FAMILY_CODE = whatever-you-like
```

Redeploy, and the app asks for it once per device. Case and spaces are ignored, so
`Kubica 81` and `kubica81` are the same code. After a correct answer the phone keeps
a derived token — not the code itself — and opens straight away from then on, even
with no signal. A wrong answer costs the guesser three quarters of a second, which
makes working through a six-character code pointless.

**Leave `FAMILY_CODE` unset and nothing changes** — no lock screen, open AI, exactly
as the app behaved before. That is deliberate: a half-finished deploy can never lock
you out of your own garage.

Settings → **Lock this phone** clears the token if you lend the phone out. Change
`FAMILY_CODE` in Vercel and every device is logged out at once.

> This is a family lock, not a bank vault. `index.html` is still downloadable by
> anyone, so treat it as "keeps strangers and search engines out", not as a secret.
> The AI endpoints, which are the part that costs money, are genuinely closed.

Two things worth pairing it with: keep the Moonshot account **prepaid** with a small
balance, so the worst case is capped at whatever you topped up; and remember Vercel's
Hobby tier is **non-commercial use only**.

## Where your data lives

Everything is on the phone. Cars, builds and settings go in `localStorage`; photos go in
IndexedDB (shrunk to 1600 px first, so a few hundred fit comfortably).

Nothing is uploaded, which also means **nothing is backed up**. Clearing Safari's website
data wipes the garage. Settings → **Export backup** writes a JSON file of cars, builds and
settings — worth doing now and then. Note the export does *not* contain the photos
themselves, only everything else.

## Cost

Vercel's free tier covers this. The AI is pay-per-request and only fires when it has to.

Three things keep the bill down, all on by default:

1. **The 18 built-in parts are free.** Turbo, wider tyres, ECU tune, wing, coilovers,
   exhaust, cage, nitrous and the rest are matched by pattern and cost nothing. The model
   is only asked about mods it has never heard of. Settings → *What the AI costs you*
   flips this to always-ask if you prefer per-car numbers.
2. **Photos are free.** *Search the web* opens a finder that searches Wikimedia Commons —
   millions of openly-licensed photos, no key, no AI, no cost. Google, Bing and DuckDuckGo
   open in a new tab from the same panel for anything Commons doesn't have.
3. **Spec lookup is the only expensive call**, and it is one tap, once per car.

Rough per-action cost on Kimi K2.6 (Aug 2026 prices):

| Action | Cost |
|---|---|
| A built-in mod | $0 |
| An unusual mod the AI has to judge | ~$0.002 |
| A full spec lookup with web search | ~$0.011 |
| Finding a photo | $0 |

A heavy day — 50 mods, 40 of them built-ins, plus 5 new cars looked up — lands near
**$0.08**, so roughly **$2–3 a month** for constant use. Kimi K2.5 is about a third
cheaper again if that matters.

## Choosing the AI

Nothing in `index.html` knows or cares which model answers. The app POSTs `{prompt}` to
two endpoints; `api/_provider.js` decides who gets it. Set these in Vercel → Settings →
Environment Variables.

| Variable | Meaning |
|---|---|
| `AI_PROVIDER` | `openrouter` · `moonshot` · `deepseek` · `openai` · `compatible` · `anthropic` |
| `AI_API_KEY` | key for that provider |
| `AI_MODEL` | optional; each provider has a sensible default |
| `AI_BASE_URL` | only for `compatible` — any OpenAI-shaped `/chat/completions` endpoint |
| `SEARCH_PROVIDER` | `tavily` or `brave` — only needed for providers without their own search |
| `SEARCH_API_KEY` | key for that search service |

### The recommended setup

```
AI_PROVIDER = openrouter
AI_API_KEY  = sk-or-...
AI_MODEL    = deepseek/deepseek-v4-flash      # or moonshotai/kimi-k2.6, or any open model
```

One key, one account, and you can change model by editing one variable — DeepSeek today,
Kimi tomorrow, Qwen or Llama the day after, without touching code. Web search comes free:
the adapter appends `:online` to the model name, which makes OpenRouter run the search
and hand back `url_citation` annotations. Those become the source links on the car.

### Moonshot / Kimi direct

```
AI_PROVIDER = moonshot
AI_API_KEY  = sk-...
```

Kimi has its own `$web_search` built-in tool, so no search service is needed. The adapter
does the required two-round-trip dance for you.

> **Note the default model is `kimi-k2.6`, not `kimi-k3`.** Moonshot's own docs recommend
> k3 for search because of its 1M context, but as of August 2026 there's an open bug where
> echoing the `$web_search` tool result back to k3 fails with `400 tokenization failed`,
> while the byte-identical request works on k2.6. OpenClaw's `kimi-search` tool defaults
> to k2.6 for the same reason. If you set `AI_MODEL=kimi-k3` and spec lookup starts
> failing, that's why — check whether the bug has been fixed before switching.

### DeepSeek direct

```
AI_PROVIDER     = deepseek
AI_API_KEY      = sk-...
SEARCH_PROVIDER = tavily
SEARCH_API_KEY  = tvly-...
```

DeepSeek's `/chat/completions` has no built-in search — only its newer Responses API does.
So the adapter searches first and pastes the findings into the prompt. Skip the search
variables and it still works, just answering from memory: fine for a GT3 RS, unreliable
for a 1987 Lancia you found in a barn.

**On search keys:** Tavily still gives 1,000 credits a month free with no card. Brave
**discontinued its free tier in February 2026** — every plan is now metered, with $5 of
monthly credit (~1,000 searches) and a card that starts billing once that runs out. If you
want a free search allowance, use Tavily. If you use Kimi or OpenRouter you need neither.

### Local, self-hosted, or through OpenClaw

```
AI_PROVIDER  = compatible
AI_BASE_URL  = http://your-gateway/v1/chat/completions
AI_API_KEY   = whatever-it-wants
AI_MODEL     = qwen3-72b
```

Anything that speaks OpenAI's chat-completions shape works — Groq, Together, Fireworks,
Ollama, llama.cpp, or an OpenClaw gateway you expose. One caveat: **Vercel functions run
in the cloud, so the URL has to be reachable from the internet.** A gateway on your Mac
at `localhost` won't be. Either expose it (Tailscale Funnel, Cloudflare Tunnel) or host
the app somewhere on the same network as the gateway.

### Swapping in something else entirely

`api/_provider.js` exports two functions: `chat(prompt)` and
`chatWithSearch(prompt, query)`. Add a branch, keep the return shapes, done. The rest of
the app never changes.

---

Powered by [bitbutt.com](https://bitbutt.com)

## A note on where photos come from

Wikimedia Commons is used because every file there carries an explicit licence, the API is
free and open, and it works directly from the browser. The licence is shown on each result
and the file page is saved as a source on the car.

**Grokipedia has no public API.** There is an unofficial Python wrapper that calls an
undocumented internal endpoint, but it isn't sanctioned, can change without notice, would
be blocked by the browser's cross-origin rules (so it would need a server proxy), and the
rights on its images are unclear. Not worth building on. If xAI ships a real API later, it
drops into `commonsPhotos()` in an afternoon.
