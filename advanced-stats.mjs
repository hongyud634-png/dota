const slots = [0,1,2,3,4,128,129,130,131,132];
const number = value => typeof value === "number" && Number.isFinite(value);
const count = value => number(value) && value >= 0;
const beijing = epoch => new Date((epoch + 28800) * 1000).toISOString().slice(0,19).replace("T"," ");
export const laneNames = {1:"优势路",2:"中路",3:"劣势路",4:"野区"};
export const keyItems = {
  blink:"闪烁匕首",black_king_bar:"黑皇杖",manta:"幻影斧",bfury:"狂战斧",radiance:"辉耀",ultimate_scepter:"阿哈利姆神杖",
  aghanims_shard:"阿哈利姆魔晶",sheepstick:"邪恶镰刀",desolator:"黯灭",hurricane_pike:"飓风长戟",butterfly:"蝴蝶",
  greater_crit:"代达罗斯之殇",heart:"恐鳌之心",assault:"强袭胸甲",shivas_guard:"希瓦的守护",refresher:"刷新球",
  octarine_core:"玲珑心",orchid:"紫怨",bloodthorn:"血棘",force_staff:"原力法杖",glimmer_cape:"微光披风",
  guardian_greaves:"卫士胫甲",vladmir:"弗拉迪米尔的祭品",pipe:"洞察烟斗",lotus_orb:"莲花宝珠",crimson_guard:"赤红甲",
  spirit_vessel:"魂之灵瓮",hand_of_midas:"迈达斯之手",boots_of_bearing:"韧鼓战靴",mage_slayer:"法师克星",harpoon:"鱼叉",
  diffusal_blade:"净魂之刃",disperser:"散失之锋",sange_and_yasha:"散夜对剑",kaya_and_sange:"慧夜对剑",yasha_and_kaya:"慧光对剑",
  satanic:"撒旦之邪力",skadi:"斯嘉蒂之眼",nullifier:"否决挂饰",rapier:"圣剑",overwhelming_blink:"盛势闪光",
  swift_blink:"迅疾闪光",arcane_blink:"奥术闪光",aeon_disk:"永恒之盘",wind_waker:"风之杖",travel_boots:"远行鞋",
  travel_boots_2:"远行鞋 II",aether_lens:"以太之镜",solar_crest:"炎阳纹章",helm_of_the_overlord:"统御头盔",ethereal_blade:"虚灵之刃",
  silver_edge:"白银之锋",bloodstone:"血精石",maelstrom:"漩涡",mjollnir:"雷神之锤",gleipnir:"缚灵索",monkey_king_bar:"金箍棒",
};

export function summarizeAnalysis(match) {
  const parsed = match.version != null && Array.isArray(match.players);
  if(!parsed) return {parsed:false,players:[]};
  const players = (match.players ?? []).filter(p => p && slots.includes(p.player_slot)).map(p => {
    const row = {player_slot:p.player_slot,hero_id:p.hero_id,account_id:p.account_id ?? null};
    for (const key of ["obs_placed","sen_placed","observer_kills","sentry_kills","camps_stacked","rune_pickups","stuns","lane_role","lane_efficiency_pct"]) {
      if (count(p[key])) row[key] = p[key];
    }
    const index = Array.isArray(p.times) ? p.times.indexOf(600) : -1;
    if (index >= 0 && match.duration >= 600) {
      for (const [key,source] of [["gold10","gold_t"],["xp10","xp_t"],["lh10","lh_t"],["dn10","dn_t"]]) {
        if (count(p[source]?.[index])) row[key] = p[source][index];
      }
    }
    return row;
  });
  return {parsed,players};
}

function analysisPlayer(match, player) {
  const summary = match.analysis ?? summarizeAnalysis(match);
  return summary.players.find(p => p.player_slot === player.player_slot && p.hero_id === player.hero_id
    && (p.account_id == null || p.account_id === (player.account_id ?? null))) ?? {};
}

const definitions = {
  contribution:[
    ["participation","击杀参与率","percent","（击杀＋助攻）÷本队总击杀；逐场比例取均值，零击杀队伍不参与。"],
    ["damage_share","团队英雄伤害占比","percent","个人英雄伤害÷本队英雄伤害；逐场比例取均值。"],
    ["tower_share","团队塔伤占比","percent","个人塔伤÷本队塔伤；逐场比例取均值，零总量不参与。"],
    ["healing_share","团队治疗占比","percent","个人治疗÷本队治疗；逐场比例取均值，零总量不参与。"],
    ["damage_min","每分钟英雄伤害","number1","有效比赛总英雄伤害÷这些比赛的总分钟数。"],
    ["healing_min","每分钟治疗","number1","有效比赛总治疗÷这些比赛的总分钟数。"],
  ],
  support:[
    ["obs_placed","场均假眼放置","number1","按有该字段的比赛统计，不将缺失记录视为零。"],
    ["sen_placed","场均真眼放置","number1","按有该字段的比赛统计，不将缺失记录视为零。"],
    ["observer_kills","场均假眼排除","number1","仅统计解析记录中的假眼击杀。"],
    ["sentry_kills","场均真眼排除","number1","仅统计解析记录中的真眼击杀。"],
    ["camps_stacked","场均堆野次数","number1","按野点堆叠次数统计，不是产生的野怪只数。"],
    ["rune_pickups","场均控符次数","number1","按解析记录中的神符拾取次数统计。"],
    ["stuns","场均控制秒数","number1","沿用 OpenDota 的累计控制时间；范围控制可能累计多个目标。"],
  ],
  laning:[
    ["lh10","10 分钟补刀","number1","只统计比赛达到 10 分钟且存在 600 秒采样点的记录。"],
    ["dn10","10 分钟反补","number1","只统计完整的 10 分钟采样记录。"],
    ["gold10","10 分钟经济","number1","使用 10 分钟的经济采样值，并非期末净资产。"],
    ["xp10","10 分钟经验","number1","使用 10 分钟的经验采样值。"],
    ["lane_efficiency_pct","对线效率","pct100","沿用 OpenDota 的 10 分钟经济基准口径；不是对线胜率。"],
  ],
};

export function buildAdvancedStats(matches, names = new Map(), images = new Map()) {
  const result = {};
  for (const [group,metrics] of Object.entries(definitions)) {
    result[group] = {metrics:metrics.map(([key,label,format,hint]) => ({key,label,format,hint,rows:[],valid_matches:0}))};
  }
  const buckets = new Map();
  const heroes = new Set();
  const lanes = [];
  for (const match of matches) {
    const players = Array.isArray(match.players) ? match.players.filter(Boolean) : [];
    const complete = players.length === 10 && new Set(players.map(p => p.player_slot)).size === 10 && players.every(p => slots.includes(p.player_slot) && Number.isInteger(p.hero_id) && p.hero_id>0)
      && new Set(players.map(p=>p.hero_id)).size===10;
    for (const player of players) {
      if (!player || player.account_id == null || !count(player.account_id) || !Number.isInteger(player.hero_id) || player.hero_id <= 0) continue;
      const extra = {...analysisPlayer(match,player)};
      if(match.duration<600 || !["gold10","xp10","lh10","dn10"].some(key=>count(extra[key]))) {
        for(const key of ["gold10","xp10","lh10","dn10","lane_efficiency_pct"]) delete extra[key];
      }
      const team = complete ? players.filter(p => (p.player_slot < 128) === (player.player_slot < 128)) : [];
      const teamSum = field => team.length === 5 && team.every(p => count(p[field])) ? team.reduce((sum,p) => sum + p[field],0) : null;
      const values = {...extra};
      const kills = teamSum("kills");
      values.participation = kills > 0 && count(player.kills) && count(player.assists) ? (player.kills + player.assists) / kills : null;
      for (const [key,field] of [["damage_share","hero_damage"],["tower_share","tower_damage"],["healing_share","hero_healing"]]) {
        const total = teamSum(field);
        values[key] = total > 0 && count(player[field]) ? player[field] / total : null;
      }
      values.damage_min = match.duration > 0 && count(player.hero_damage) ? player.hero_damage / (match.duration/60) : null;
      values.healing_min = match.duration > 0 && count(player.hero_healing) ? player.hero_healing / (match.duration/60) : null;
      if (Object.keys(extra).some(key => ["gold10","lh10","xp10","dn10","lane_efficiency_pct"].includes(key))) {
        heroes.add(player.hero_id);
        lanes.push({account_id:player.account_id,personaname:player.personaname ?? "",hero_id:player.hero_id,
          hero_name:names.get(player.hero_id) ?? `英雄 ${player.hero_id}`,hero_image:images.get(player.hero_id) ?? "",
          lane_role:extra.lane_role ?? null,match_id:match.match_id,values:extra});
      }
      for (const [group,section] of Object.entries(result)) {
        for (const metric of section.metrics) {
          const value = values[metric.key];
          if (!count(value)) continue;
          const id = `${group}:${metric.key}:${player.account_id}`;
          if (!buckets.has(id)) buckets.set(id,{account_id:player.account_id,personaname:player.personaname ?? "",matches:0,sum:0,weight:0});
          const row = buckets.get(id);
          if (player.personaname) row.personaname = player.personaname;
          const weight = metric.key.endsWith("_min") ? match.duration/60 : 1;
          row.matches++;
          row.sum += value * weight;
          row.weight += weight;
          (metric.match_ids ??= new Set()).add(match.match_id);
        }
      }
    }
  }
  for (const [group,section] of Object.entries(result)) {
    for (const metric of section.metrics) {
      metric.rows = [...buckets.entries()].filter(([id]) => id.startsWith(`${group}:${metric.key}:`)).map(([,row]) => ({
        account_id:row.account_id,personaname:row.personaname,matches:row.matches,value:row.sum/row.weight,
      })).sort((a,b) => b.value-a.value || b.matches-a.matches || a.account_id-b.account_id).map((row,index) => ({...row,rank:index+1}));
      metric.valid_matches = metric.match_ids?.size ?? 0;
      delete metric.match_ids;
    }
  }
  result.total_matches = matches.length;
  result.parsed_matches = matches.filter(match => (match.analysis ?? summarizeAnalysis(match)).parsed).length;
  result.laning.records = lanes;
  result.laning.heroes = [...heroes].sort((a,b)=>a-b).map(id => ({id,name:names.get(id) ?? `英雄 ${id}`}));
  result.review_matches = [...matches].sort((a,b)=>b.start_time-a.start_time).map(match => ({match_id:match.match_id,start_time:beijing(match.start_time),
    radiant_name:match.radiant_name ?? "天辉",dire_name:match.dire_name ?? "夜魇",parsed:(match.analysis ?? summarizeAnalysis(match)).parsed,checked:Boolean(match.analysis_checked_at)||match.version!=null}));
  return {advanced_stats:result};
}

export function buildReview(match, names = new Map(), images = new Map()) {
  const players = (match.players ?? []).filter(p => p && slots.includes(p.player_slot)).map(p => ({player_slot:p.player_slot,
    account_id:p.account_id ?? null,personaname:p.personaname ?? "",hero_id:p.hero_id,hero_name:names.get(p.hero_id) ?? `英雄 ${p.hero_id}`,
    hero_image:images.get(p.hero_id) ?? "",items:(p.purchase_log ?? []).filter(item => keyItems[item.key] && number(item.time))
      .map(item=>({key:item.key,name:keyItems[item.key],time:item.time})).sort((a,b)=>a.time-b.time),
  }));
  const curves = [];
  const gold = match.radiant_gold_adv, xp = match.radiant_xp_adv;
  const length = Math.max(gold?.length ?? 0,xp?.length ?? 0);
  for (let i=0;i<length;i++) curves.push({minute:i,gold:number(gold?.[i]) ? gold[i] : null,xp:number(xp?.[i]) ? xp[i] : null});
  const fights = (match.teamfights ?? []).filter(f=>number(f.start)&&number(f.end)&&Array.isArray(f.players)).map(f => ({
    start:f.start,end:f.end,players:f.players.flatMap((p,i) => {
      const player = players.find(player => player.player_slot === (i<5 ? i : i+123));
      return player ? [{...player,items:undefined,deaths:number(p.deaths)?p.deaths:null,damage:number(p.damage)?p.damage:null,
        healing:number(p.healing)?p.healing:null,gold_delta:number(p.gold_delta)?p.gold_delta:null,xp_delta:number(p.xp_delta)?p.xp_delta:null}] : [];
    }),
  }));
  const objectiveNames = {building_kill:"建筑摧毁",CHAT_MESSAGE_ROSHAN_KILL:"击杀肉山",CHAT_MESSAGE_AEGIS:"拾取不朽之守护",
    CHAT_MESSAGE_AEGIS_STOLEN:"抢夺不朽之守护",CHAT_MESSAGE_MINIBOSS_KILL:"击杀魔晶守卫",CHAT_MESSAGE_FIRSTBLOOD:"第一滴血"};
  const objectives = (match.objectives ?? []).filter(o=>objectiveNames[o.type] && number(o.time)).map(o=>({time:o.time,label:objectiveNames[o.type],
    target:o.type==="building_kill" ? String(o.key ?? "") : "",player_slot:slots.includes(o.player_slot)?o.player_slot:null,
    side:o.type!=="building_kill" && [2,3].includes(o.team) ? (o.team===2 ? "天辉" : "夜魇") : null,
  })).sort((a,b)=>a.time-b.time);
  const advantages = curves.map(p=>p.gold).filter(number);
  const radiantLead = advantages.length ? Math.max(0,...advantages) : null;
  const direLead = advantages.length ? Math.max(0,...advantages.map(v=>-v)) : null;
  return {match_id:match.match_id,leagueid:match.leagueid,start_time:beijing(match.start_time),duration:match.duration,
    radiant_name:match.radiant_name ?? "天辉",dire_name:match.dire_name ?? "夜魇",radiant_win:match.radiant_win,
    parsed:match.version != null,players,curves,fights,objectives,radiant_lead:radiantLead,dire_lead:direLead,
    comeback:typeof match.radiant_win === "boolean" ? (match.radiant_win ? direLead : radiantLead) : null};
}
