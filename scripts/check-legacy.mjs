import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { buildHeroStats } from "../public/hero-stats.mjs";
import { buildMatchRecords } from "../public/match-records.mjs";
import { buildAdvancedStats } from "../public/advanced-stats.mjs";

const seed = JSON.parse(await readFile(new URL('../public/data/opendota_league_18113_seed.json',import.meta.url),'utf8'));
const originalSeed = JSON.parse(execFileSync('git',['show','0b739e3:public/data/opendota_league_18113_seed.json'],{encoding:'utf8',maxBuffer:50000000}));
const currentMatches = new Map(seed.matches.map(match => [match.match_id,match]));
const withoutDraft = ({picks_bans,draft_checked_at,analysis,analysis_checked_at,...match}) => match;
for (const match of originalSeed.matches) assert.deepEqual(withoutDraft(currentMatches.get(match.match_id)),withoutDraft(match),'Historical records may only gain BP fields');
const previous = execFileSync('git',['show','0b739e3:public/static-data.js'],{encoding:'utf8'});
const current = await readFile(new URL('../public/static-data.js',import.meta.url),'utf8');
async function backend(source) {
  const context = vm.createContext({window:{heroStatsReady:Promise.resolve({buildHeroStats}),matchRecordsReady:Promise.resolve({buildMatchRecords}),advancedStatsReady:Promise.resolve({buildAdvancedStats})},document:{baseURI:'https://example.com/dota/'},
    URL,AbortController,setTimeout,clearTimeout,fetch:async()=>({ok:true,status:200,json:async()=>seed})});
  vm.runInContext(source,context);
  return context.window.StaticBackend;
}
const old = await backend(previous), updated = await backend(current);
for (const filters of [{},{startDate:'2026-05-01',endDate:'2026-05-31'},{startDate:'2026-10-01',endDate:'2026-10-20'}]) {
  const a = JSON.parse(JSON.stringify(await old.dashboard(filters)));
  const b = JSON.parse(JSON.stringify(await updated.dashboard(filters)));
  delete b.hero_stats; delete b.hero_rankings; delete b.hero_coverage;
  delete b.match_records;
  delete b.advanced_stats;
  delete b.league.data_stale; delete b.league.sync_progress;
  delete a.league.generated_at; delete b.league.generated_at;
  assert.deepEqual(b,a,'Existing player statistics, rankings, coverage and matches must remain identical');
}
console.log('PASS: all legacy output fields unchanged against previous deployed implementation for all/May/October filters');
