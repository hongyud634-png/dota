import { readFile,writeFile,mkdir } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { summarizeAnalysis,buildReview } from "../public/advanced-stats.mjs";

const seedUrl = new URL("../public/data/opendota_league_18113_seed.json",import.meta.url);
const reviewDir = new URL("../public/data/analysis/",import.meta.url);

export async function updateAnalysis(seed, request, saveReview, pause = sleep, all = false) {
  const names = new Map(Object.values(seed.heroes ?? {}).map(h=>[Number(h.id),h.localized_name ?? h.name]));
  const images = new Map(Object.values(seed.heroes ?? {}).map(h=>[Number(h.id),`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${h.name.replace("npc_dota_hero_","")}.png`]));
  const replacements = new Map();
  const pending = seed.matches.filter(m=>!m.analysis?.parsed && (!m.analysis_checked_at || Date.now()-Date.parse(m.analysis_checked_at)>=86400000));
  const deadline = Date.now()+20*60*1000;
  for (const match of all ? pending : pending.slice(0,50)) {
    if (Date.now()>=deadline) break;
    try {
      let raw = match;
      if (match.version == null) { await pause(1250); raw = await request(match.match_id); }
      if (raw.match_id!==match.match_id || Number(raw.leagueid)!==18113 || !Array.isArray(raw.players)) throw Error("Invalid analysis response");
      const analysis = summarizeAnalysis(raw);
      const enriched = {...match,analysis,analysis_checked_at:new Date().toISOString()};
      await saveReview(match.match_id,buildReview(raw,names,images));
      replacements.set(match.match_id,enriched);
      console.log(`Analysis ${match.match_id}: ${analysis.parsed ? "available" : "unavailable"}`);
    } catch(error) { console.warn(`Analysis ${match.match_id} deferred: ${error.message}`); }
  }
  return {...seed,matches:seed.matches.map(m=>replacements.get(m.match_id) ?? m)};
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  await mkdir(reviewDir,{recursive:true});
  const seed = JSON.parse(await readFile(seedUrl,"utf8"));
  const updated = await updateAnalysis(seed,async id=>{
    for(let attempt=1;attempt<=3;attempt++) {
      try {
        const response=await fetch(`https://api.opendota.com/api/matches/${id}`,{signal:AbortSignal.timeout(25000)});
        if(!response.ok) throw Error(`OpenDota HTTP ${response.status}`);
        return await response.json();
      } catch(error) {if(attempt===3) throw error;await sleep(5000*attempt);}
    }
  },async(id,review)=>writeFile(new URL(`${id}.json`,reviewDir),JSON.stringify(review)),sleep,process.argv.includes("--all"));
  const content=JSON.stringify(updated);
  await writeFile(seedUrl,content);
  await writeFile(new URL("../seed/opendota_league_18113_seed.json",import.meta.url),content);
  console.log(`Analysis cache: ${updated.matches.filter(m=>m.analysis?.parsed).length}/${updated.matches.length} parsed; ${updated.matches.filter(m=>!m.analysis_checked_at).length} unchecked`);
}
