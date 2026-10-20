import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { buildHeroStats } from "../public/hero-stats.mjs";

let now = Date.parse("2026-10-20T04:00:00Z");
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
const match = id => ({match_id:id,leagueid:18113,start_time:Date.parse('2026-10-19T12:00:00Z')/1000,radiant_win:true,
  players:Array.from({length:10},(_,i)=>({hero_id:i+1,player_slot:i<5?i:123+i}))});
const seed = {generatedAt:'2026-10-19T04:00:00Z',heroes:{},matchIds:[1],matches:[match(1)]};
let publishedSeed = seed;
let version = 'v1';
let listRequests=0;
let fail=false;
const context = vm.createContext({
  window:{heroStatsReady:Promise.resolve({buildHeroStats})},document:{baseURI:'https://example.com/dota/'},Date:Clock,URL,AbortController,AbortSignal,
  setTimeout:(fn,delay)=>{if(delay<20000)queueMicrotask(fn);return 0;},clearTimeout(){},
  fetch:async url=>{
    if(url.includes('matchIds')) { listRequests++; if(fail){now+=100000;throw Error('offline');} }
    return {ok:true,status:200,headers:{get:()=>version},json:async()=>url.includes('seed.json')?structuredClone(publishedSeed):url.includes('matchIds')?[1,2]:match(Number(url.split('/').at(-1)))};
  },
});
vm.runInContext(await readFile(new URL('../public/static-data.js',import.meta.url),'utf8'),context);
const backend=context.window.StaticBackend;
const progress=[];
const options={autoRefresh:true,startDate:'2026-10-19',endDate:'2026-10-19',onProgress:m=>progress.push(m)};
const [one,two]=await Promise.all([backend.dashboard(options),backend.dashboard(options)]);
assert.equal(listRequests,1,'concurrent automatic requests must share one sync');
assert.equal(one.league.included_matches,2);
assert.equal(two.league.included_matches,2);
assert.equal(one.league.date_start,options.startDate);
assert.equal(one.league.data_stale,false);
assert.ok(progress.length>0);
await backend.dashboard(options);
assert.equal(listRequests,1,'fresh data must not sync again');
now+=2*3600000+1;
fail=true;
const failed=await backend.dashboard(options);
assert.equal(failed.league.data_stale,true);
assert.ok(failed.league.last_error.includes('offline'));
const requestsAfterFailure=listRequests;
await backend.dashboard(options);
assert.equal(listRequests,requestsAfterFailure,'automatic failures must wait five minutes');
now+=5*60000;
fail=false;
const retried=await backend.dashboard(options);
assert.equal(retried.league.data_stale,false);
assert.equal(retried.league.last_error,null);
assert.equal(retried.league.date_end,options.endDate);
now+=5*60000;
version='v2';
publishedSeed={...seed,generatedAt:new Date(now).toISOString(),matchIds:[1,3],matches:[match(1),match(3)]};
const merged=await backend.dashboard(options);
assert.equal(merged.league.included_matches,3,'new published data must preserve locally fetched match 2');
assert.equal(merged.league.date_end,options.endDate);
console.log('PASS: stale-data auto sync, shared requests, progress, freshness, five-minute backoff, retry and preserved date filters');
