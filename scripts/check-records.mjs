import assert from "node:assert/strict";
import { buildMatchRecords } from "../public/match-records.mjs";

const player = (account_id,kills) => ({account_id,hero_id:1,player_slot:account_id,kills,deaths:0,assists:2});
const matches = [
  {match_id:2,start_time:200,players:[player(1,10),player(2,8)]},
  {match_id:1,start_time:100,players:[player(1,10),player(3,null),player(4,-1),player(5,Infinity),null]},
];
const before = structuredClone(matches);
const records = buildMatchRecords(matches).match_records;
const kills = records.find(metric => metric.key === "kills");
assert.deepEqual(kills.rows.map(row => [row.match_id,row.account_id,row.value]),[[1,1,10],[2,1,10],[2,2,8]]);
assert.equal(records.find(metric => metric.key === "kda").rows[0].value,12);
assert.equal(records.find(metric => metric.key === "net_worth").rows.length,0);
assert.equal(buildMatchRecords([]).match_records.every(metric => !metric.rows.length),true);
assert.equal(buildMatchRecords([{...matches[0],players:[{...player(1,4),hero_id:999}]}],new Map([[1,"Hero"]])).match_records[0].rows.length,0);
assert.equal(buildMatchRecords([matches[0]]).match_records[0].rows.length,2);
assert.deepEqual(matches,before);
console.log("PASS: twelve single-match records, Top 3, repeated holders, stable ties, zero-death KDA, missing/invalid values, empty scopes and preserved input");
