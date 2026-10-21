import assert from "node:assert/strict";
import {buildAdvancedStats,buildReview,summarizeAnalysis} from "../public/advanced-stats.mjs";
import {updateAnalysis} from "./update-analysis.mjs";

const players=Array.from({length:10},(_,i)=>({account_id:i+1,hero_id:i+1,player_slot:i<5?i:i+123,kills:i+1,assists:2,
  hero_damage:(i+1)*100,tower_damage:0,hero_healing:0,obs_placed:0,sen_placed:1,lane_role:2,lane_efficiency_pct:100,
  times:[0,300,600],lh_t:[0,20,50],dn_t:[0,2,5],gold_t:[0,1000,2500],xp_t:[0,900,2000]}));
const match={match_id:1,leagueid:18113,start_time:1700000000,duration:1800,radiant_win:false,version:22,players};
const before=structuredClone(match);
const stats=buildAdvancedStats([match]).advanced_stats;
const metric=(group,key)=>stats[group].metrics.find(m=>m.key===key);
assert.equal(metric("contribution","participation").rows.find(r=>r.account_id===1).value,0.2);
assert.equal(metric("contribution","damage_share").rows.find(r=>r.account_id===1).value,1/15);
assert.equal(metric("contribution","tower_share").valid_matches,0,"zero totals do not become zero-percent participation");
assert.equal(metric("support","obs_placed").rows[0].value,0,"recorded zero is valid");
assert.equal(metric("support","camps_stacked").rows.length,0,"missing value is not zero");
assert.equal(metric("laning","lh10").rows[0].value,50,"600-second sample may not be array index 10");
assert.equal(buildAdvancedStats([{...match,version:undefined}]).advanced_stats.support.metrics[0].valid_matches,0);
assert.equal(buildAdvancedStats([{...match,duration:599}]).advanced_stats.laning.metrics[0].valid_matches,0);
assert.equal(buildAdvancedStats([{...match,duration:599}]).advanced_stats.laning.metrics.at(-1).valid_matches,0);
const weighted=buildAdvancedStats([60,120].map((duration,i)=>({...match,match_id:i+1,duration,players:[{...players[0],hero_damage:600}]}))).advanced_stats.contribution.metrics.find(m=>m.key==="damage_min");
assert.equal(weighted.rows[0].value,400,"DPM must weight by valid duration");
const summary=summarizeAnalysis(match);
const mismatched={...match,version:undefined,analysis:{...summary,players:summary.players.map(p=>({...p,hero_id:999}))}};
assert.equal(buildAdvancedStats([mismatched]).advanced_stats.support.metrics[0].valid_matches,0);
assert.deepEqual(match,before,"statistics must not mutate original records");
const raw={...match,radiant_gold_adv:[100,-500,200],radiant_xp_adv:[100,null,300],players:[...players].reverse().map(p=>({...p,purchase_log:[{key:"recipe_black_king_bar",time:1},{key:"black_king_bar",time:900},{key:"blink",time:600}]})),
  teamfights:[{start:10,end:30,players:players.map((p,i)=>({deaths:i,damage:100,healing:0,gold_delta:-5,xp_delta:3}))}],objectives:[{type:"CHAT_MESSAGE_ROSHAN_KILL",time:1200,team:3}]};
const review=buildReview(raw);
assert.equal(review.comeback,200,"Dire winner's maximum deficit is the maximum Radiant lead");
assert.equal(review.fights[0].players[0].account_id,1,"parse slot mapping must survive reversed player array");
assert.deepEqual(review.players[0].items.map(i=>i.time),[600,900]);
assert.equal(review.objectives[0].side,"夜魇");
assert.equal(review.curves[1].xp,null);
assert.equal(buildReview({...match,radiant_gold_adv:undefined}).comeback,null);
const seed={heroes:{},matches:[{...match,version:undefined}]};
const seedBefore=structuredClone(seed);
let calls=0;
const updated=await updateAnalysis(seed,async()=>{calls++;return match;},async()=>{},async()=>{},true);
assert.equal(calls,1);
assert.deepEqual(updated.matches[0].players,seed.matches[0].players);
assert.deepEqual(seed,seedBefore);
assert.equal(updated.matches[0].analysis.parsed,true);
await updateAnalysis(updated,async()=>{throw Error("must not re-fetch parsed match");},async()=>{},async()=>{},true);
console.log("PASS: team ratios, missing/zero distinction, duration weighting, ten-minute samples, identity matching, review side/slot mapping, item times, supplemental backfill and original records");
