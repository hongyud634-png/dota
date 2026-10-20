import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { draftBans } from "../public/hero-stats.mjs";

const leagueId = 18113;
const seedUrl = new URL("../public/data/opendota_league_18113_seed.json", import.meta.url);

async function fetchJson(path) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`https://api.opendota.com/api${path}`, {
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`OpenDota HTTP ${response.status}: ${path}`);
      return await response.json();
    } catch (error) {
      if (attempt === 4) throw error;
      await sleep(15000 * attempt);
    }
  }
}

export async function updateData(seed, request = fetchJson, pause = sleep) {
  const ids = await request(`/leagues/${leagueId}/matchIds`);
  if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) {
    throw new Error("OpenDota returned an invalid match list; keeping previous data.");
  }
  const matchIds = [...new Set(ids.map(Number))].sort((a, b) => a - b);
  // Keep previously published matches if the upstream list temporarily omits them.
  const matches = new Map(seed.matches.map((match) => [Number(match.match_id), match]));
  for (const matchId of matchIds) {
    if (matches.has(matchId)) continue;
    await pause(1250);
    const match = await request(`/matches/${matchId}`);
    if (Number(match.match_id) !== matchId || Number(match.leagueid) !== leagueId || !Array.isArray(match.players) || match.players.length === 0) {
      throw new Error(`Invalid details for match ${matchId}; keeping previous data.`);
    }
    matches.set(matchId, match);
    console.log(`Fetched match ${matchId} (${matches.size} cached)`);
  }
  return {
    ...seed,
    generatedAt: new Date().toISOString(),
    matchIds: [...new Set([...matches.keys(), ...matchIds])].sort((a, b) => a - b),
    matches: [...matches.values()].sort((a, b) => Number(a.match_id) - Number(b.match_id)),
  };
}

export async function backfillDrafts(seed, request = fetchJson, pause = sleep, attempted = new Set(), deadline = Infinity) {
  const now = Date.now();
  const pending = seed.matches.filter(match => !attempted.has(match.match_id) && !draftBans(match)
    && (!match.draft_checked_at || now - Date.parse(match.draft_checked_at) >= 86400000)).slice(0,50);
  const replacements = new Map();
  for (const match of pending) {
    if (Date.now() >= deadline) break;
    attempted.add(match.match_id);
    try {
      await pause(1250);
      const raw = await request(`/matches/${match.match_id}`);
      if (Number(raw.match_id) !== Number(match.match_id) || Number(raw.leagueid) !== leagueId) throw new Error("Mismatched match");
      replacements.set(match.match_id, {...match, picks_bans:Array.isArray(raw.picks_bans) ? raw.picks_bans : null,
        draft_checked_at:new Date().toISOString() });
      console.log(`Checked draft ${match.match_id}: ${draftBans(raw) ? "available" : "unavailable"}`);
    } catch (error) {
      console.warn(`Draft ${match.match_id} deferred: ${error.message}`);
    }
  }
  return {...seed, matches:seed.matches.map(match => replacements.get(match.match_id) ?? match)};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const seed = JSON.parse(await readFile(seedUrl, "utf8"));
  let updated = await updateData(seed);
  const attempted = new Set();
  const deadline = Date.now() + 20 * 60 * 1000;
  do {
    const previousAttempts = attempted.size;
    updated = await backfillDrafts(updated, fetchJson, sleep, attempted, deadline);
    if (!process.argv.includes("--backfill-all") || attempted.size === previousAttempts) break;
    // Save each completed batch so a later network failure cannot discard it.
    const batch = JSON.stringify(updated);
    await writeFile(seedUrl, batch);
    await writeFile(new URL("../seed/opendota_league_18113_seed.json", import.meta.url), batch);
  } while (true);
  const content = JSON.stringify(updated);
  await writeFile(seedUrl, content);
  await writeFile(new URL("../seed/opendota_league_18113_seed.json", import.meta.url), content);
  console.log(`Updated complete dataset: ${updated.matches.length} matches, ${updated.generatedAt}`);
}
