import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { updateData } from "./update-data.mjs";
import { buildHeroStats } from "../public/hero-stats.mjs";

const match = (id, date = "2026-10-01") => ({
  match_id: id, leagueid: 18113, start_time: Date.parse(`${date}T12:00:00+08:00`) / 1000,
  radiant_win: true, duration: 1800,
  players: [{ account_id: 1, player_slot: 0, kills: 2, deaths: 1, assists: 3 }],
});
const seed = { leagueId: 18113, generatedAt: "2026-06-01T01:21:58.321Z", heroes: {}, matchIds: [1], matches: [match(1, "2026-06-01")] };
const ids = Array.from({ length: 23 }, (_, i) => i + 1);
const requested = [];
const request = async (path) => {
  requested.push(path);
  return path.includes("matchIds") ? ids : match(Number(path.split("/").at(-1)));
};
const updated = await updateData(seed, request, async () => {});
assert.equal(updated.matches.length, 23, "must fetch more than 20 missing matches");
assert.equal(requested.length, 23, "must reuse existing match details");
assert.equal(seed.matches.length, 1, "must not mutate previous data");
assert.deepEqual(updated.matchIds, ids);
await assert.rejects(updateData(seed, async () => [], async () => {}), /invalid match list/);
await assert.rejects(updateData(seed, async (path) => path.includes("matchIds") ? [2] : { ...match(2), leagueid: 99 }, async () => {}), /Invalid details/);
const retained = await updateData(updated, async () => [1], async () => {});
assert.equal(retained.matches.length, 23, "temporary upstream omissions must not delete published matches");

const context = vm.createContext({
  window: {heroStatsReady:Promise.resolve({buildHeroStats})}, document: { baseURI: "https://example.com/dota/" }, URL,
  AbortController, setTimeout: (fn) => { queueMicrotask(fn); return 0; }, clearTimeout() {},
  fetch: async (url) => ({ ok: true, status: 200, json: async () =>
    url.includes("seed.json") ? structuredClone(seed) : url.includes("matchIds") ? ids : match(Number(url.split("/").at(-1))) }),
});
vm.runInContext(await readFile(new URL("../public/static-data.js", import.meta.url), "utf8"), context);
const backend = context.window.StaticBackend;
const first = await backend.dashboard();
assert.equal(first.league.included_matches, 1);
assert.equal(first.league.last_sync_finished_at, "2026-06-01 09:21:58", "show actual Beijing update time");
const all = await backend.dashboard({ refresh: true });
assert.equal(all.league.included_matches, 23, "manual sync must also fetch all missing matches");
assert.equal(all.league.last_error, null);
const filtered = await backend.dashboard({ startDate: "2026-10-01", endDate: "2026-10-01" });
assert.equal(filtered.league.included_matches, 22);
assert.equal(filtered.players[0].matches, 22);
assert.equal(filtered.rankings.win_rate.rows[0].value, 1);
assert.equal((await backend.dashboard()).league.included_matches, 23, "clearing dates restores all matches");
console.log("PASS: complete incremental update, failure protection, manual sync, real update time and date filtering");
