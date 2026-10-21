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

单场纪录模块展示击杀、死亡、助攻、补刀、反补、GPM、XPM、经济、英雄伤害、塔伤、治疗和 KDA 的最高三条个人单场表现，随日期筛选更新，并提供记录保持者、英雄、数值、比赛时间和比赛链接。同一玩家可占多席，同值按比赛时间、比赛 ID、玩家位置先后排列；缺失或异常数值不参与。KDA 沿用 `(kills + assists) / max(deaths, 1)`。`node scripts/check-records.mjs` 检查该统计口径。

## 页签与高阶统计

界面按概览、指标排行、最近比赛、英雄排行、单场纪录、团队贡献、辅助贡献、对线表现、比赛复盘、玩家均值和比赛明细分为 11 个页签，每次只展示一个模块。公共日期筛选和同步按钮对所有页签生效；模块可通过 URL 的 `#contribution`、`#review` 等片段直接打开，支持键盘左右键、Home、End 切换。

团队贡献包含击杀参与率、伤害／塔伤／治疗占比和每分钟伤害／治疗。比例为有效比赛的逐场比例均值，零分母不参与；每分钟指标为有效比赛总数值除以总分钟数。辅助贡献包含假眼、真眼、排眼、堆野、控符和累计控制时间。对线表现支持按英雄、路线筛选，使用准确的 600 秒采样点及 OpenDota 对线效率；缺失值不作零处理。每项单独列出有效比赛数和每位玩家的有效场次，新指标不套用原有玩家榜的 3% 门槛，原有榜单口径保持不变。

`scripts/update-analysis.mjs` 每次最多补取 50 场；`--all` 首次连续补取，单次最多使用 20 分钟。已解析记录复用缓存，无解析记录每天最多复查一次，网络失败后续重试。新数据仅写入原比赛的 `analysis`、`analysis_checked_at` 补充字段，不覆盖原始玩家和胜负数据。`public/data/analysis/<match_id>.json` 单独保存每场的曲线、关键装备日志、团战和目标事件，进入复盘页签后按需加载；未发布的新比赛可从 OpenDota 只读补取。后台发布与每小时更新同时维护这些文件。

`public/advanced-stats.mjs` 由浏览器、Node 和 Worker 复用，新增响应字段 `advanced_stats`；原有字段保持兼容。`node scripts/check-advanced.mjs` 检查统计口径、补取及复盘映射，`scripts/check-modules.js` 可通过 Playwright CLI 检查页签、18 项新指标、日期范围、空状态和桌面／平板／390px 布局。

GitHub Pages 静态版不依赖后端 API；如果 `/api` 不可用，前端会自动切到浏览器本地数据模式，读取 `public/data/opendota_league_18113_seed.json`。

## 部署到 Render

1. 把本目录推送到 GitHub/GitLab/Bitbucket。
2. 打开 Render Blueprint，选择该仓库。
3. Render 会读取 `render.yaml` 并创建 Web Service。

部署后访问 Render 提供的公网 URL 即可。
