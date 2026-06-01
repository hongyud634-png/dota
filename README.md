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

## 部署到 Render

1. 把本目录推送到 GitHub/GitLab/Bitbucket。
2. 打开 Render Blueprint，选择该仓库。
3. Render 会读取 `render.yaml` 并创建 Web Service。

部署后访问 Render 提供的公网 URL 即可。
