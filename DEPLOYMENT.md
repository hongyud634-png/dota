# Deployment

This app is a single Node.js web service. It is ready for Render Blueprint deployment.

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
