# Litigation Review Guide Builder — Netlify Deployment

## Quick Deploy

1. **Push to GitHub** — Create a repo and push this folder
2. **Connect to Netlify** — New site → Import from Git → Select repo
3. **Set environment variables** in Netlify → Site Settings → Environment Variables:

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_KEY_1` | ✅ | First Anthropic API key |
| `ANTHROPIC_KEY_2` | Optional | Second key for parallel research |
| `ANTHROPIC_KEY_3` | Optional | Third key for more parallelism |
| `ANTHROPIC_KEY_4` | Optional | Fourth key |
| `ANTHROPIC_KEY_5` | Optional | Fifth key |
| `SITE_PASSWORD` | Optional | Password-protect the tool |

4. **Deploy** — Netlify auto-deploys on push

## How It Works

```
Browser (public/index.html)
    │
    ├── POST /api/anthropic  ──→  Netlify Edge Function (proxy.ts)
    │   (x-key-index: 2)              │
    │                                  ├── Reads ANTHROPIC_KEY_2 from env
    │                                  ├── Forwards request to api.anthropic.com
    │                                  └── Streams response back to browser
    │
    └── GET /api/anthropic   ──→  Returns key count + password status
```

- **API keys never touch the browser.** The edge function reads them from Netlify environment variables and proxies all requests.
- **Multiple keys** enable parallel research passes. The browser sends `x-key-index: 1`, `x-key-index: 2`, etc. to distribute load.
- **Optional password** protects the site. Set `SITE_PASSWORD` env var and users must enter it before the tool works.
- **Streaming works end-to-end.** The edge function pipes Anthropic's SSE stream directly through.

## Project Structure

```
├── netlify.toml                        # Netlify config (edge function routing)
├── netlify/edge-functions/proxy.ts     # API proxy (Deno edge function)
├── public/index.html                   # The full application (single file)
└── README.md                           # This file
```

## Local Development

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Set env vars locally
echo 'ANTHROPIC_KEY_1=sk-ant-your-key-here' > .env

# Run dev server
netlify dev
```

## Recommended Setup for 3 Keys

In Netlify environment variables:
```
ANTHROPIC_KEY_1 = sk-ant-xxxxx
ANTHROPIC_KEY_2 = sk-ant-yyyyy
ANTHROPIC_KEY_3 = sk-ant-zzzzz
SITE_PASSWORD = your-team-password
```

In the app sidebar:
- Stagger delay: 15s
- Max parallel: 2
- Model: Opus

This gives you 2 research passes running in parallel with key rotation, the third key staying fresh for generation batches.
