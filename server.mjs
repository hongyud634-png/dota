import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const cacheDir = process.env.OPENDOTA_CACHE_DIR
  ?? (process.env.NODE_ENV === "production"
    ? path.join(__dirname, "data", "cache")
    : "D:\\QA\\work\\opendota_stats\\cache");
const matchCacheDir = path.join(cacheDir, "matches");

const CONFIG = {
  leagueId: 18113,
  leagueName: "鹏辉产业园第三届AMER讲伍德比赛",
  apiBase: "https://api.opendota.com/api",
  syncIntervalMs: 5 * 60 * 1000,
  detailDelayMs: 1250,
  rankingMinMatchRate: 0.03,
};

const state = {
  heroesById: new Map(),
  heroImagesById: new Map(),
  matchIds: [],
  matchesById: new Map(),
  datasets: new Map(),
  isSyncing: false,
  lastSyncStartedAt: null,
  lastSyncFinishedAt: null,
  lastError: null,
};

const sessions = new Map();

const metricRanking = [
  ["win_rate", "胜率", "desc", "percent"],
  ["kda", "KDA", "desc", "number2"],
  ["avg_kills", "平均击杀", "desc", "number1"],
  ["avg_deaths", "平均死亡", "desc", "number1"],
  ["avg_assists", "平均助攻", "desc", "number1"],
  ["avg_gold_per_min", "平均GPM", "desc", "number1"],
  ["avg_xp_per_min", "平均XPM", "desc", "number1"],
  ["avg_last_hits", "平均补刀", "desc", "number1"],
  ["avg_denies", "平均反补", "desc", "number1"],
  ["avg_net_worth", "平均经济", "desc", "number1"],
  ["avg_hero_damage", "平均英雄伤害", "desc", "number1"],
  ["avg_tower_damage", "平均塔伤", "desc", "number1"],
  ["avg_hero_healing", "平均治疗量", "desc", "number1"],
];

const numericStats = [
  "kills",
  "deaths",
  "assists",
  "last_hits",
  "denies",
  "gold_per_min",
  "xp_per_min",
  "net_worth",
  "hero_damage",
  "tower_damage",
  "hero_healing",
];

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function n(value) {
  return Number(value) || 0;
}

function round(value, digits = 1) {
  const multiplier = 10 ** digits;
  return Math.round((Number(value) || 0) * multiplier) / multiplier;
}

function toBeijingString(epochSeconds) {
  if (!Number.isFinite(Number(epochSeconds))) return "";
  const date = new Date(Number(epochSeconds) * 1000 + 8 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function toBeijingDate(epochSeconds) {
  return toBeijingString(epochSeconds).slice(0, 10);
}

function isoBeijingNow() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
}

function validDateInput(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function dateStartEpoch(dateString) {
  if (!dateString) return 0;
  return Math.floor(Date.parse(`${dateString}T00:00:00+08:00`) / 1000);
}

function dateEndEpoch(dateString) {
  if (!dateString) return Number.POSITIVE_INFINITY;
  return Math.floor(Date.parse(`${dateString}T00:00:00+08:00`) / 1000) + 24 * 60 * 60 - 1;
}

function normalizeDateFilter(startDate, endDate) {
  let start = validDateInput(startDate);
  let end = validDateInput(endDate);
  if (start && end && start > end) {
    [start, end] = [end, start];
  }
  return {
    startDate: start,
    endDate: end,
    startEpoch: dateStartEpoch(start),
    endEpoch: dateEndEpoch(end),
  };
}

function isRadiantSlot(playerSlot) {
  return Number(playerSlot) < 128;
}

function playerWon(player, match) {
  return isRadiantSlot(player.player_slot) ? Boolean(match.radiant_win) : !Boolean(match.radiant_win);
}

function sideName(player) {
  return isRadiantSlot(player.player_slot) ? "天辉" : "夜魇";
}

function winnerName(match) {
  return match.radiant_win ? "天辉" : "夜魇";
}

function matchParseStatus(match) {
  if (!Array.isArray(match.players)) return "缺少 players 明细";
  if (match.players.length === 0) return "players 为空";
  if (match.players.length !== 10) return `players=${match.players.length}`;
  return "OK";
}

function heroImageFromName(name) {
  if (!name || !name.startsWith("npc_dota_hero_")) return "";
  const shortName = name.replace("npc_dota_hero_", "");
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${shortName}.png`;
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fetchJson(url, { retries = 5, timeoutMs = 45000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "Codex OpenDota league dashboard" },
      });
      clearTimeout(timer);
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`${response.status} ${response.statusText}`);
        await sleep(response.status === 429 ? Math.min(90000, 15000 * attempt) : 1500 * attempt ** 2);
        continue;
      }
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt < retries) await sleep(Math.min(60000, 1000 * attempt ** 2));
    }
  }
  throw lastError;
}

async function loadHeroes() {
  let heroes = await readJsonIfExists(path.join(cacheDir, "heroes.json"));
  if (!heroes) {
    heroes = await fetchJson(`${CONFIG.apiBase}/constants/heroes`);
    await writeJson(path.join(cacheDir, "heroes.json"), heroes);
  }
  state.heroesById.clear();
  state.heroImagesById.clear();
  for (const hero of Object.values(heroes)) {
    state.heroesById.set(Number(hero.id), hero.localized_name ?? hero.name ?? String(hero.id));
    state.heroImagesById.set(Number(hero.id), heroImageFromName(hero.name));
  }
}

async function loadCachedMatches() {
  await fs.mkdir(matchCacheDir, { recursive: true });
  const files = await fs.readdir(matchCacheDir);
  state.matchesById.clear();
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const match = await readJsonIfExists(path.join(matchCacheDir, file));
    if (match && Number(match.leagueid) === CONFIG.leagueId) {
      state.matchesById.set(Number(match.match_id), match);
    }
  }
}

async function loadMatchIdsFromCache() {
  const ids = await readJsonIfExists(path.join(cacheDir, `league_${CONFIG.leagueId}_match_ids_latest.json`));
  state.matchIds = Array.isArray(ids) ? ids.map(Number).filter(Number.isFinite) : Array.from(state.matchesById.keys());
}

async function fetchMatchIds() {
  const ids = await fetchJson(`${CONFIG.apiBase}/leagues/${CONFIG.leagueId}/matchIds`);
  const numericIds = ids.map(Number).filter(Number.isFinite);
  await writeJson(path.join(cacheDir, `league_${CONFIG.leagueId}_match_ids_latest.json`), numericIds);
  state.matchIds = numericIds;
  return numericIds;
}

async function ensureKnownMatchesCached(ids) {
  const missing = ids.filter((id) => !state.matchesById.has(Number(id)));
  for (let index = 0; index < missing.length; index += 1) {
    await fetchAndCacheMatch(missing[index]);
  }
  return missing.length;
}

async function fetchAndCacheMatch(matchId) {
  const cachePath = path.join(matchCacheDir, `${matchId}.json`);
  const cached = await readJsonIfExists(cachePath);
  if (cached) {
    state.matchesById.set(Number(matchId), cached);
    return cached;
  }
  const match = await fetchJson(`${CONFIG.apiBase}/matches/${matchId}`, { retries: 6, timeoutMs: 60000 });
  await writeJson(cachePath, match);
  state.matchesById.set(Number(matchId), match);
  await sleep(CONFIG.detailDelayMs);
  return match;
}

function topHeroes(heroCounts) {
  return Array.from(heroCounts.entries())
    .map(([heroId, games]) => ({
      hero_id: Number(heroId),
      hero_name: state.heroesById.get(Number(heroId)) ?? String(heroId),
      hero_image: state.heroImagesById.get(Number(heroId)) ?? "",
      games,
    }))
    .sort((a, b) => b.games - a.games || a.hero_id - b.hero_id)
    .slice(0, 3);
}

function buildDataset(filters = {}) {
  const dateFilter = normalizeDateFilter(filters.startDate, filters.endDate);
  const scopeLabel = dateFilter.startDate || dateFilter.endDate
    ? `${dateFilter.startDate || "最早"} 至 ${dateFilter.endDate || "最新"}`
    : "全联赛";
  const allLeagueMatches = state.matchIds
    .map((id) => state.matchesById.get(Number(id)))
    .filter(Boolean)
    .filter((match) => Number(match.leagueid) === CONFIG.leagueId)
    .sort((a, b) => Number(a.start_time) - Number(b.start_time));
  const availableStartDate = allLeagueMatches[0] ? toBeijingDate(allLeagueMatches[0].start_time) : "";
  const availableEndDate = allLeagueMatches.at(-1) ? toBeijingDate(allLeagueMatches.at(-1).start_time) : "";
  const matches = state.matchIds
    .map((id) => state.matchesById.get(Number(id)))
    .filter(Boolean)
    .filter((match) => Number(match.leagueid) === CONFIG.leagueId)
    .filter((match) => Number(match.start_time) >= dateFilter.startEpoch)
    .filter((match) => Number(match.start_time) <= dateFilter.endEpoch)
    .sort((a, b) => Number(a.start_time) - Number(b.start_time));

  const playerRows = [];
  const aggregates = new Map();
  const matchRows = [];
  const issues = [];

  for (const match of matches) {
    const players = Array.isArray(match.players) ? match.players : [];
    const status = matchParseStatus(match);
    const startTime = toBeijingString(match.start_time);
    const durationMinutes = round(n(match.duration) / 60, 1);
    const matchRow = {
      match_id: Number(match.match_id),
      start_time: startTime,
      start_epoch: Number(match.start_time),
      duration_minutes: durationMinutes,
      radiant_name: match.radiant_name ?? "天辉",
      dire_name: match.dire_name ?? "夜魇",
      winner: winnerName(match),
      radiant_win: Boolean(match.radiant_win),
      player_count: players.length,
      status,
      url: `https://www.opendota.com/matches/${match.match_id}`,
      standout_players: [],
    };
    if (status !== "OK") issues.push(matchRow);

    const localPlayerRows = [];
    for (const player of players) {
      const heroId = Number(player.hero_id) || null;
      const won = playerWon(player, match);
      const row = {
        match_id: Number(match.match_id),
        start_time: startTime,
        duration_minutes: durationMinutes,
        account_id: player.account_id == null ? null : Number(player.account_id),
        personaname: player.personaname ?? "",
        side: sideName(player),
        result: won ? "胜" : "负",
        hero_id: heroId,
        hero_name: heroId ? state.heroesById.get(heroId) ?? "" : "",
        hero_image: heroId ? state.heroImagesById.get(heroId) ?? "" : "",
        kills: n(player.kills),
        deaths: n(player.deaths),
        assists: n(player.assists),
        last_hits: n(player.last_hits),
        denies: n(player.denies),
        gold_per_min: n(player.gold_per_min),
        xp_per_min: n(player.xp_per_min),
        net_worth: n(player.net_worth),
        hero_damage: n(player.hero_damage),
        tower_damage: n(player.tower_damage),
        hero_healing: n(player.hero_healing),
      };
      playerRows.push(row);
      localPlayerRows.push(row);

      if (row.account_id == null) continue;
      if (!aggregates.has(row.account_id)) {
        aggregates.set(row.account_id, {
          account_id: row.account_id,
          personaname: "",
          matches: 0,
          wins: 0,
          losses: 0,
          duration: 0,
          latestStartTime: "",
          heroCounts: new Map(),
          sums: Object.fromEntries(numericStats.map((key) => [key, 0])),
        });
      }
      const aggregate = aggregates.get(row.account_id);
      aggregate.matches += 1;
      aggregate.wins += won ? 1 : 0;
      aggregate.losses += won ? 0 : 1;
      aggregate.duration += n(match.duration);
      if (row.personaname) aggregate.personaname = row.personaname;
      if (row.start_time > aggregate.latestStartTime) aggregate.latestStartTime = row.start_time;
      if (heroId) aggregate.heroCounts.set(heroId, (aggregate.heroCounts.get(heroId) ?? 0) + 1);
      for (const key of numericStats) aggregate.sums[key] += row[key];
    }

    matchRow.standout_players = localPlayerRows
      .filter((row) => row.account_id != null)
      .sort((a, b) => (b.kills + b.assists - b.deaths) - (a.kills + a.assists - a.deaths))
      .slice(0, 3)
      .map((row) => ({
        account_id: row.account_id,
        personaname: row.personaname,
        hero_name: row.hero_name,
        hero_image: row.hero_image,
        kda_line: `${row.kills}/${row.deaths}/${row.assists}`,
      }));
    matchRows.push(matchRow);
  }

  const players = Array.from(aggregates.values())
    .map((aggregate) => {
      const games = aggregate.matches;
      const totalDeaths = aggregate.sums.deaths;
      const player = {
        account_id: aggregate.account_id,
        personaname: aggregate.personaname,
        matches: games,
        wins: aggregate.wins,
        losses: aggregate.losses,
        win_rate: aggregate.wins / games,
        avg_duration_minutes: aggregate.duration / games / 60,
        kda: (aggregate.sums.kills + aggregate.sums.assists) / Math.max(totalDeaths, 1),
        latest_start_time: aggregate.latestStartTime,
        top_heroes: topHeroes(aggregate.heroCounts),
      };
      for (const key of numericStats) player[`avg_${key}`] = aggregate.sums[key] / games;
      return player;
    })
    .sort((a, b) => b.matches - a.matches || b.win_rate - a.win_rate || a.account_id - b.account_id)
    .map((player) => ({
      ...player,
      win_rate: round(player.win_rate, 4),
      avg_duration_minutes: round(player.avg_duration_minutes, 1),
      kda: round(player.kda, 2),
      avg_kills: round(player.avg_kills, 1),
      avg_deaths: round(player.avg_deaths, 1),
      avg_assists: round(player.avg_assists, 1),
      avg_last_hits: round(player.avg_last_hits, 1),
      avg_denies: round(player.avg_denies, 1),
      avg_gold_per_min: round(player.avg_gold_per_min, 1),
      avg_xp_per_min: round(player.avg_xp_per_min, 1),
      avg_net_worth: round(player.avg_net_worth, 1),
      avg_hero_damage: round(player.avg_hero_damage, 1),
      avg_tower_damage: round(player.avg_tower_damage, 1),
      avg_hero_healing: round(player.avg_hero_healing, 1),
    }));

  const rankingMinMatches = matches.length > 0
    ? Math.max(1, Math.ceil(matches.length * CONFIG.rankingMinMatchRate))
    : 0;
  const rankingPlayers = players.filter((player) => player.matches >= rankingMinMatches);
  const rankings = Object.fromEntries(metricRanking.map(([key, label, direction, format]) => {
    const rows = [...rankingPlayers]
      .sort((a, b) => {
        const delta = n(a[key]) - n(b[key]);
        if (delta !== 0) return direction === "asc" ? delta : -delta;
        return b.matches - a.matches || a.account_id - b.account_id;
      })
      .slice(0, 10)
      .map((player, index) => ({
        rank: index + 1,
        account_id: player.account_id,
        personaname: player.personaname,
        matches: player.matches,
        value: player[key],
        top_heroes: player.top_heroes,
      }));
    return [key, { key, label, direction, format, rows }];
  }));

  const latestMatch = matches.at(-1);
  return {
    league: {
      id: CONFIG.leagueId,
      name: CONFIG.leagueName,
      scope: "date",
      scope_label: scopeLabel,
      date_start: dateFilter.startDate,
      date_end: dateFilter.endDate,
      available_date_start: availableStartDate,
      available_date_end: availableEndDate,
      generated_at: isoBeijingNow(),
      last_sync_started_at: state.lastSyncStartedAt,
      last_sync_finished_at: state.lastSyncFinishedAt,
      is_syncing: state.isSyncing,
      last_error: state.lastError,
      total_match_ids: state.matchIds.length,
      included_matches: matches.length,
      player_rows: playerRows.length,
      player_count: players.length,
      ranking_player_count: rankingPlayers.length,
      ranking_min_matches: rankingMinMatches,
      ranking_min_match_rate: CONFIG.rankingMinMatchRate,
      parse_issue_count: issues.length,
      latest_match_time: latestMatch ? toBeijingString(latestMatch.start_time) : "",
      latest_match_id: latestMatch ? Number(latestMatch.match_id) : null,
    },
    metrics: metricRanking.map(([key, label, direction, format]) => ({ key, label, direction, format })),
    players,
    rankings,
    recent_matches: matchRows.slice(-30).reverse(),
    issues: issues.reverse(),
  };
}

function rebuildDatasets() {
  state.datasets.set("all", buildDataset());
}

async function initializeFromCache() {
  await loadHeroes();
  await loadCachedMatches();
  await loadMatchIdsFromCache();
  rebuildDatasets();
}

async function syncLatest() {
  if (state.isSyncing) return;
  state.isSyncing = true;
  state.lastSyncStartedAt = isoBeijingNow();
  state.lastError = null;
  rebuildDatasets();
  try {
    const ids = await fetchMatchIds();
    await ensureKnownMatchesCached(ids);
    await loadCachedMatches();
    rebuildDatasets();
    state.lastSyncFinishedAt = isoBeijingNow();
  } catch (error) {
    state.lastError = error?.message ?? String(error);
    rebuildDatasets();
    throw error;
  } finally {
    state.isSyncing = false;
    rebuildDatasets();
  }
}

function jsonResponse(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function parseCookies(req) {
  const header = req.headers.cookie ?? "";
  return Object.fromEntries(header.split(";").map((part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    return [decodeURIComponent(rawKey || ""), decodeURIComponent(rawValue.join("=") || "")];
  }).filter(([key]) => key));
}

function currentUser(req) {
  const token = parseCookies(req).od_session;
  return token ? sessions.get(token) ?? null : null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function readJsonBody(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  return JSON.parse(raw);
}

function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", `od_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "od_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

async function serveStatic(req, res, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(publicDir, requestedPath));
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const body = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": contentTypes[ext] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch (error) {
    if (error.code === "ENOENT") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    throw error;
  }
}

function cloneDataset(dataset) {
  return JSON.parse(JSON.stringify(dataset));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/health") {
      jsonResponse(res, 200, {
        ok: true,
        league_id: CONFIG.leagueId,
        cached_matches: state.matchesById.size,
        known_match_ids: state.matchIds.length,
        is_syncing: state.isSyncing,
        last_sync_finished_at: state.lastSyncFinishedAt,
      });
      return;
    }
    if (url.pathname === "/api/me") {
      jsonResponse(res, 200, { user: currentUser(req) });
      return;
    }
    if (url.pathname === "/api/login" && req.method === "POST") {
      let body;
      try {
        body = await readJsonBody(req);
      } catch {
        jsonResponse(res, 400, { error: "登录请求格式不正确" });
        return;
      }
      const name = String(body.name ?? "").trim().slice(0, 40);
      if (!name) {
        jsonResponse(res, 400, { error: "请输入昵称" });
        return;
      }
      const token = crypto.randomUUID();
      const user = {
        id: token,
        name,
        logged_in_at: isoBeijingNow(),
      };
      sessions.set(token, user);
      setSessionCookie(res, token);
      jsonResponse(res, 200, { user });
      return;
    }
    if (url.pathname === "/api/logout" && req.method === "POST") {
      const token = parseCookies(req).od_session;
      if (token) sessions.delete(token);
      clearSessionCookie(res);
      jsonResponse(res, 200, { ok: true });
      return;
    }
    if (url.pathname === "/api/dashboard") {
      const user = currentUser(req);
      if (!user) {
        jsonResponse(res, 401, { error: "请先登录" });
        return;
      }
      const refresh = url.searchParams.get("refresh") === "1";
      const wait = url.searchParams.get("wait") === "1";
      if (refresh && !state.isSyncing) {
        const syncPromise = syncLatest().catch(() => undefined);
        if (wait) await syncPromise;
      }
      const dataset = buildDataset({
        startDate: url.searchParams.get("startDate"),
        endDate: url.searchParams.get("endDate"),
      });
      jsonResponse(res, 200, cloneDataset(dataset));
      return;
    }
    if (url.pathname === "/api/sync") {
      const user = currentUser(req);
      if (!user) {
        jsonResponse(res, 401, { error: "请先登录" });
        return;
      }
      if (!state.isSyncing) await syncLatest().catch(() => undefined);
      const dataset = buildDataset();
      jsonResponse(res, state.lastError ? 500 : 200, {
        ok: !state.lastError,
        is_syncing: state.isSyncing,
        last_error: state.lastError,
        league: dataset.league,
      });
      return;
    }
    await serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error(error);
    jsonResponse(res, 500, { error: error?.message ?? String(error) });
  }
});

await initializeFromCache();
syncLatest().catch((error) => console.error("Initial sync failed:", error));
setInterval(() => syncLatest().catch((error) => console.error("Scheduled sync failed:", error)), CONFIG.syncIntervalMs);

const preferredPort = Number(process.env.PORT) || 4173;
const host = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
server.listen(preferredPort, host, () => {
  const address = server.address();
  console.log(`OpenDota league dashboard running at http://${host}:${address.port}`);
});
