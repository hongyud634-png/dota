import {readFile,writeFile,mkdir} from "node:fs/promises";
import vm from "node:vm";
import assert from "node:assert/strict";
import {buildHeroStats} from "../public/hero-stats.mjs";
import {buildMatchRecords} from "../public/match-records.mjs";
import {buildAdvancedStats,summarizeAnalysis} from "../public/advanced-stats.mjs";

const root=new URL("../public/data/",import.meta.url);
const source=await readFile(new URL("../public/static-data.js",import.meta.url),"utf8");
const original=JSON.parse(await readFile(new URL("opendota_league_18113_seed.json",root),"utf8"));
const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(value,key)).map(key=>[key,value[key]]));
const lean={...original,heroes:Object.fromEntries(Object.entries(original.heroes).map(([id,hero])=>[id,pick(hero,["id","name","localized_name"])])),matches:original.matches.map(match=>({
  ...pick(match,["match_id","leagueid","start_time","duration","radiant_win","radiant_name","dire_name","picks_bans","version","analysis_checked_at"]),
  analysis:match.analysis ?? summarizeAnalysis(match),
  players:(match.players ?? []).map(player=>pick(player,["account_id","personaname","hero_id","player_slot","kills","deaths","assists","last_hits","denies","gold_per_min","xp_per_min","net_worth","hero_damage","tower_damage","hero_healing"])),
}))};

async function dataset(seed, filters = {}) {
  const context=vm.createContext({window:{heroStatsReady:Promise.resolve({buildHeroStats}),matchRecordsReady:Promise.resolve({buildMatchRecords}),advancedStatsReady:Promise.resolve({buildAdvancedStats})},
    document:{baseURI:"https://example.com/dota/"},URL,AbortController,setTimeout,clearTimeout,
    fetch:async()=>({ok:true,status:200,json:async()=>seed})});
  vm.runInContext(source,context);
  return JSON.parse(JSON.stringify(await context.window.StaticBackend.dashboard(filters)));
}
const full=await dataset(original);
const compact=await dataset(lean);
const withoutClock=data=>({...data,league:{...data.league,generated_at:null}});
assert.deepEqual(withoutClock(compact),withoutClock(full),"Browser projection must preserve every statistic, date range and ranking");
for(const month of ["05","10"]) {
  const filters={startDate:`2026-${month}-01`,endDate:`2026-${month}-31`};
  assert.deepEqual(withoutClock(await dataset(lean,filters)),withoutClock(await dataset(original,filters)),"Filtered statistics must remain identical");
}
await writeFile(new URL("browser-seed.json",root),JSON.stringify(lean));
const version=original.generatedAt;
const league=full.league;
const names=full.players.map(player=>pick(player,["account_id","personaname"]));
const advanced=group=>({total_matches:full.advanced_stats.total_matches,parsed_matches:full.advanced_stats.parsed_matches,[group]:full.advanced_stats[group]});
const pages={
  overview:{},ranking:pick(full,["metrics","rankings"]),recent:pick(full,["recent_matches"]),
  heroes:pick(full,["hero_rankings","hero_coverage"]),records:{match_records:full.match_records,players:names},
  contribution:{advanced_stats:advanced("contribution"),players:names},support:{advanced_stats:advanced("support"),players:names},
  laning:{advanced_stats:advanced("laning"),players:names},
  review:{advanced_stats:{review_matches:full.advanced_stats.review_matches},hero_stats:full.hero_stats.map(hero=>pick(hero,["hero_id","hero_name","hero_image"]))},
  players:pick(full,["players"]),matches:pick(full,["issues","recent_matches"]),
};
await mkdir(new URL("modules/",root),{recursive:true});
for(const [page,data] of Object.entries(pages)) {
  await writeFile(new URL(`modules/${page}.json`,root),JSON.stringify({version,published_page:page,league,...data}));
}
await writeFile(new URL("overview.json",root),JSON.stringify({version,published_page:"overview",league}));
console.log(`Browser data: ${Buffer.byteLength(JSON.stringify(original))} → ${Buffer.byteLength(JSON.stringify(lean))} bytes; overview ${Buffer.byteLength(JSON.stringify({version,published_page:"overview",league}))} bytes; all statistics identical`);
