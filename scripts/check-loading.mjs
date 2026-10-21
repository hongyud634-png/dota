import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import * as heroes from "../public/hero-stats.mjs";
import * as records from "../public/match-records.mjs";
import * as advanced from "../public/advanced-stats.mjs";

const source=await readFile(new URL("../public/static-data.js",import.meta.url),"utf8");
const seed=JSON.parse(await readFile(new URL("../public/data/browser-seed.json",import.meta.url),"utf8"));
const overview=JSON.parse(await readFile(new URL("../public/data/overview.json",import.meta.url),"utf8"));
let now=Date.parse(seed.generatedAt);
class Clock extends Date { static now(){return now;} }
function backend(fetch) {
  const context=vm.createContext({Date:Clock,document:{baseURI:"https://example.com/dota/"},URL,AbortController,AbortSignal,setTimeout,clearTimeout,
    window:{heroStatsReady:Promise.resolve(heroes),matchRecordsReady:Promise.resolve(records),advancedStatsReady:Promise.resolve(advanced)},fetch});
  vm.runInContext(source,context);
  return context.window.StaticBackend;
}
const requests=[];
const response=data=>({ok:true,status:200,json:async()=>data});
const fast=backend(async url=>{
  requests.push(String(url));
  if(String(url).includes("browser-seed")) return response(seed);
  return response(JSON.parse(await readFile(new URL(`../public/${new URL(url).pathname.replace("/dota/","")}`,import.meta.url),"utf8")));
});
await fast.dashboard({page:"overview",autoRefresh:true});
assert.equal(requests.length,1,"Initial overview must require just one tiny JSON");
assert.ok(requests[0].includes("overview.json"));
await fast.dashboard({page:"heroes"});
await fast.dashboard({page:"heroes"});
assert.equal(requests.length,2,"Revisiting a tab must reuse its snapshot");
const may=await fast.dashboard({page:"players",startDate:"2026-05-01",endDate:"2026-05-31"});
assert.equal(may.league.included_matches,91);
assert.equal(requests.filter(url=>url.includes("browser-seed")).length,1);

now+=3*60*60*1000;
let release,updates=0,seedRequests=0,apiRequests=0;
const pending=new Promise(resolve=>{release=resolve;});
const stale=backend(async url=>{
  if(String(url).includes("overview.json")) return response(overview);
  if(String(url).includes("browser-seed")) {seedRequests++;await pending;return response(seed);}
  apiRequests++;return response(seed.matchIds);
});
const options={page:"overview",autoRefresh:true,onUpdate:()=>{updates++;}};
const first=await Promise.race([stale.dashboard(options),new Promise((_,reject)=>setTimeout(()=>reject(Error("Stale snapshot blocked by background recovery")),100))]);
assert.equal(first.league.data_stale,true);
assert.equal(first.league.is_syncing,true);
await stale.dashboard(options);
assert.equal(seedRequests,1,"Recovery must be shared");
release();
await new Promise(resolve=>setTimeout(resolve,30));
assert.equal(apiRequests,1);
assert.equal(updates,1);
const recovered=await stale.dashboard({page:"overview",autoRefresh:true});
assert.equal(recovered.league.data_stale,false);
console.log("PASS: one-file first view, lazy tab loading, cached revisits, identical May scope, nonblocking stale recovery and deduplicated synchronization");
