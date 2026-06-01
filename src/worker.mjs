import seedData from "../seed/opendota_league_18113_seed.json" with { type: "json" };

const CONFIG = {
  leagueId: 18113,
  leagueName: "鹏辉产业园第三届AMER讲伍德比赛",
  apiBase: "https://api.opendota.com/api",
  rankingMinMatchRate: 0.03,
  maxMissingMatchesPerSync: 20,
};

const state = {
  initialized: false,
  initPromise: null,
  heroesById: new Map(),
  heroImagesById: new Map(),
  matchIds: [],
  matchesById: new Map(),
  syncPromise: null,
  isSyncing: false,
  lastSyncStartedAt: null,
  lastSyncFinishedAt: null,
  lastError: null,
};

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

async function fetchJson(url, { retries = 4, timeoutMs = 30000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "OpenDota league dashboard" },
      });
      clearTimeout(timer);
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`${response.status} ${response.statusText}`);
        await sleep(response.status === 429 ? Math.min(15000, 3000 * attempt) : 500 * attempt ** 2);
        continue;
      }
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt < retries) await sleep(Math.min(5000, 500 * attempt ** 2));
    }
  }
  throw lastError;
}

function loadSeed() {
  state.heroesById.clear();
  state.heroImagesById.clear();
  for (const hero of Object.values(seedData.heroes ?? {})) {
    state.heroesById.set(Number(hero.id), hero.localized_name ?? hero.name ?? String(hero.id));
    state.heroImagesById.set(Number(hero.id), heroImageFromName(hero.name));
  }

  state.matchesById.clear();
  for (const match of seedData.matches ?? []) {
    if (Number(match.leagueid) === CONFIG.leagueId) {
      state.matchesById.set(Number(match.match_id), match);
    }
  }

  state.matchIds = Array.isArray(seedData.matchIds)
    ? seedData.matchIds.map(Number).filter(Number.isFinite)
    : Array.from(state.matchesById.keys());
  state.lastSyncFinishedAt = seedData.generatedAt
    ? `${seedData.generatedAt} seed`
    : isoBeijingNow();
}

async function ensureInitialized() {
  if (state.initialized) return;
  if (!state.initPromise) {
    state.initPromise = Promise.resolve().then(() => {
      loadSeed();
      state.initialized = true;
    });
  }
  await state.initPromise;
}

async function syncLatest() {
  if (state.syncPromise) return state.syncPromise;
  state.syncPromise = (async () => {
    state.isSyncing = true;
    state.lastSyncStartedAt = isoBeijingNow();
    state.lastError = null;
    try {
      const ids = await fetchJson(`${CONFIG.apiBase}/leagues/${CONFIG.leagueId}/matchIds`);
      const numericIds = ids.map(Number).filter(Number.isFinite);
      state.matchIds = numericIds;

      const missing = numericIds
        .filter((id) => !state.matchesById.has(Number(id)))
        .sort((a, b) => b - a)
        .slice(0, CONFIG.maxMissingMatchesPerSync);

      for (const matchId of missing) {
        const match = await fetchJson(`${CONFIG.apiBase}/matches/${matchId}`, {
          retries: 4,
          timeoutMs: 30000,
        });
        if (Number(match.leagueid) === CONFIG.leagueId) {
          state.matchesById.set(Number(match.match_id), match);
        }
        await sleep(150);
      }

      state.lastSyncFinishedAt = isoBeijingNow();
    } catch (error) {
      state.lastError = error?.message ?? String(error);
      throw error;
    } finally {
      state.isSyncing = false;
      state.syncPromise = null;
    }
  })();
  return state.syncPromise;
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
  const matches = allLeagueMatches
    .filter((match) => Number(match.start_time) >= dateFilter.startEpoch)
    .filter((match) => Number(match.start_time) <= dateFilter.endEpoch);

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

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function parseCookies(request) {
  const header = request.headers.get("Cookie") ?? "";
  return Object.fromEntries(header.split(";").map((part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    return [decodeURIComponent(rawKey || ""), decodeURIComponent(rawValue.join("=") || "")];
  }).filter(([key]) => key));
}

function base64UrlEncode(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

function encodeUser(user) {
  return base64UrlEncode(JSON.stringify(user));
}

function currentUser(request) {
  const encoded = parseCookies(request).od_session;
  if (!encoded) return null;
  try {
    const user = JSON.parse(base64UrlDecode(encoded));
    if (!user?.name || !user?.id) return null;
    return {
      id: String(user.id),
      name: String(user.name).slice(0, 40),
      logged_in_at: String(user.logged_in_at || ""),
    };
  } catch {
    return null;
  }
}

function secureCookieSuffix(request) {
  return new URL(request.url).protocol === "https:" ? "; Secure" : "";
}

function setSessionCookie(request, user) {
  return `od_session=${encodeURIComponent(encodeUser(user))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secureCookieSuffix(request)}`;
}

function clearSessionCookie(request) {
  return `od_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureCookieSuffix(request)}`;
}

async function handleApi(request, env, ctx) {
  await ensureInitialized();
  const url = new URL(request.url);

  if (url.pathname === "/api/health") {
    return jsonResponse(200, {
      ok: true,
      runtime: "cloudflare-worker",
      league_id: CONFIG.leagueId,
      cached_matches: state.matchesById.size,
      known_match_ids: state.matchIds.length,
      is_syncing: state.isSyncing,
      last_sync_finished_at: state.lastSyncFinishedAt,
      last_error: state.lastError,
    });
  }

  if (url.pathname === "/api/me") {
    return jsonResponse(200, { user: currentUser(request) });
  }

  if (url.pathname === "/api/login" && request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(400, { error: "登录请求格式不正确" });
    }
    const name = String(body.name ?? "").trim().slice(0, 40);
    if (!name) return jsonResponse(400, { error: "请输入昵称" });
    const user = {
      id: crypto.randomUUID(),
      name,
      logged_in_at: isoBeijingNow(),
    };
    return jsonResponse(200, { user }, { "Set-Cookie": setSessionCookie(request, user) });
  }

  if (url.pathname === "/api/logout" && request.method === "POST") {
    return jsonResponse(200, { ok: true }, { "Set-Cookie": clearSessionCookie(request) });
  }

  if (url.pathname === "/api/dashboard") {
    const user = currentUser(request);
    if (!user) return jsonResponse(401, { error: "请先登录" });

    const refresh = url.searchParams.get("refresh") === "1";
    const wait = url.searchParams.get("wait") === "1";
    if (refresh) {
      const sync = syncLatest().catch(() => undefined);
      if (wait) await sync;
      else ctx.waitUntil(sync);
    }

    return jsonResponse(200, buildDataset({
      startDate: url.searchParams.get("startDate"),
      endDate: url.searchParams.get("endDate"),
    }));
  }

  if (url.pathname === "/api/sync") {
    const user = currentUser(request);
    if (!user) return jsonResponse(401, { error: "请先登录" });
    await syncLatest().catch(() => undefined);
    const dataset = buildDataset();
    return jsonResponse(state.lastError ? 500 : 200, {
      ok: !state.lastError,
      is_syncing: state.isSyncing,
      last_error: state.lastError,
      league: dataset.league,
    });
  }

  return jsonResponse(404, { error: "Not found" });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, ctx);
      } catch (error) {
        return jsonResponse(500, { error: error?.message ?? String(error) });
      }
    }
    return env.ASSETS.fetch(request);
  },
};
