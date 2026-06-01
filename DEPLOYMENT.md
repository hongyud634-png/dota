# Deployment

This app can run either as the original Node.js web service or as a Cloudflare Worker with static assets.

## Cloudflare Workers

Cloudflare is the recommended no-credit-card deployment path for this project.

1. Create or log in to a Cloudflare account.
2. Authenticate Wrangler:
   ```bash
   npx wrangler login
   ```
3. Deploy:
   ```bash
   npm install
   npm run deploy:cloudflare
   ```

The Worker uses:

- Worker entry: `src/worker.mjs`
- Static assets: `public/`
- Config: `wrangler.jsonc`
- Health check: `/api/health`

The Cloudflare version loads the bundled seed data immediately, then fetches new OpenDota matches on demand when users click "同步最新".

## Render

1. Push this repository to GitHub, GitLab, or Bitbucket.
2. Open Render's Blueprint flow:
   `https://dashboard.render.com/blueprint/new`
3. Select the repository.
4. Render reads `render.yaml` and creates the web service.

The service uses:

- Build command: `npm install`
- Start command: `npm start`
- Health check: `/api/health`
- Runtime env:
  - `NODE_ENV=production`
  - `HOST=0.0.0.0`
  - `OPENDOTA_CACHE_DIR=/opt/render/project/src/data/cache`

Seed data is included in `seed/opendota_league_18113_seed.json`, so first launch can show data immediately while the server syncs latest OpenDota match IDs in the background.

## Local Production Check

```bash
$env:NODE_ENV="production"
$env:HOST="127.0.0.1"
$env:PORT="4173"
npm start
```

Open `http://127.0.0.1:4173/api/health`.
