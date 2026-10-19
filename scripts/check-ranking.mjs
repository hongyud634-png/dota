import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const elements = { rankingHint: {}, rankingList: {} };
const context = vm.createContext({ document: { getElementById: (id) => elements[id] } });
const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
vm.runInContext(source.slice(0, source.indexOf("\nbindEvents();")), context);

for (const count of [0, 1, 2, 3, 10]) {
  const rows = Array.from({ length: count }, (_, index) => ({
    rank: index + 1, account_id: 100 + index, personaname: `非常长的玩家名称${index + 1}`.repeat(12) + '<script>',
    matches: 20 + index, value: 0.71 - index / 100, top_heroes: [],
  }));
  const data = { league: { ranking_min_matches: 14 }, rankings: {
    win_rate: { label: "胜率", format: "percent", rows },
    kda: { label: "KDA", format: "number2", rows: rows.map((row) => ({ ...row, value: 12.34 })) },
  } };
  const original = JSON.stringify(data);
  context.data = data;
  vm.runInContext('appState.metric = "win_rate"; renderRanking(data);', context);
  const html = elements.rankingList.innerHTML;
  assert.equal((html.match(/<article /g) || []).length, Math.min(count, 3));
  assert.equal((html.match(/class="rank-row"/g) || []).length, Math.max(count - 3, 0));
  assert.equal(html.includes("暂无符合"), count === 0);
  assert.equal(html.includes("<script>"), false, "names must remain HTML escaped");
  for (const row of rows) {
    assert.ok(html.includes(`${Math.round(row.value * 100)}%`));
    assert.ok(html.includes(`${row.account_id} · ${row.matches} 场`));
  }
  if (count) assert.ok(html.includes('podium-place-1'));
  vm.runInContext('appState.metric = "kda"; renderRanking(data);', context);
  assert.equal((elements.rankingList.innerHTML.match(/12\.34/g) || []).length, count);
  assert.equal(JSON.stringify(data), original, "rendering must not change rank data or order");
}
console.log("PASS: podium/list rendering for 0/1/2/3/10 players, metric formats, missing heroes, escaped names and unchanged input data");
