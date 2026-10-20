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

本仓库的 `.github/workflows/pages.yml` 负责推送到 `main` 后及手动发布；`.github/workflows/hourly-refresh.yml` 负责定时刷新。两者均发布 `public/` 目录到现有 Pages 分支，并共用发布锁。

每小时第 17 分钟自动执行：从 OpenDota 获取联赛比赛列表、补齐全部缺失的比赛明细、保存数据并发布到同一个 GitHub Pages 地址。定时任务可能受 GitHub 调度影响而延迟。也可在 Actions 中手动运行 Deploy GitHub Pages。页面检测到数据超过两小时未更新时会自动补齐；失败后至少等待五分钟再自动重试。

后台排程验收须同时核对 `schedule` 触发记录及其后的 Pages 发布成功，推送或手动触发成功不能替代定时验证。

`node scripts/update-data.mjs` 可在本地更新数据。抓取失败时脚本不会写入数据，线上继续使用上次成功发布的版本。页面默认展示全联赛，日期筛选只影响统计范围；“同步最新”可获取当天后台更新后新增的比赛。状态栏显示数据实际更新时间。

历史 BP 每批补取最多 50 场，只补充 BP 字段，不替换原有玩家记录。`node scripts/update-data.mjs --backfill-all` 连续补取缺少的历史 BP；无可用记录的比赛每天最多重查一次，网络失败留待后续重试。

英雄排行支持胜率、Ban 率和选取率，跟随日期筛选。胜率为获胜场数／出场场数，选取率为出场场数／英雄及胜负信息完整的有效比赛数；Ban 率以有有效 BP 记录的比赛数为分母，同一英雄同场只计一次。界面分别显示有效比赛数和 BP 覆盖数，缺失 BP 不作为零禁用处理。所有出场英雄均可参与胜率排名，不设置最低出场门槛。

数据与回归检查：`node scripts/check-data.mjs`、`node scripts/check-heroes.mjs`、`node scripts/check-auto-sync.mjs`、`node scripts/check-ranking.mjs`。`scripts/check-ui.js` 和 `scripts/check-hero-ui.js` 可通过 Playwright CLI 的 `run-code --filename` 在已打开的页面中执行。

GitHub Pages 静态版不依赖后端 API；如果 `/api` 不可用，前端会自动切到浏览器本地数据模式，读取 `public/data/opendota_league_18113_seed.json`。

## 部署到 Render

1. 把本目录推送到 GitHub/GitLab/Bitbucket。
2. 打开 Render Blueprint，选择该仓库。
3. Render 会读取 `render.yaml` 并创建 Web Service。

部署后访问 Render 提供的公网 URL 即可。
