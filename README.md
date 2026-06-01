# OpenDota League Dashboard

dota 数据网站：实时查看“鹏辉产业园第三届AMER讲伍德比赛”的比赛、玩家均值和指标排行。

## 本地运行

```bash
npm start
```

默认地址：`http://127.0.0.1:4173`

## 部署到 Cloudflare Workers

```bash
npm install
npm run deploy:cloudflare
```

Cloudflare 版本使用 `wrangler.jsonc` 和 `src/worker.mjs`，不需要绑定信用卡。首次部署前先运行 `npx wrangler login` 登录 Cloudflare。

## 部署到 GitHub Pages

本仓库包含 GitHub Actions workflow：`.github/workflows/pages.yml`。推送到 `main` 后会自动发布 `public/` 目录。

GitHub Pages 静态版不依赖后端 API；如果 `/api` 不可用，前端会自动切到浏览器本地数据模式，读取 `public/data/opendota_league_18113_seed.json`。

## 部署到 Render

1. 把本目录推送到 GitHub/GitLab/Bitbucket。
2. 打开 Render Blueprint，选择该仓库。
3. Render 会读取 `render.yaml` 并创建 Web Service。

部署后访问 Render 提供的公网 URL 即可。
