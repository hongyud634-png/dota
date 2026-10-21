const metrics = [
  ["kills", "单场击杀", "次"], ["deaths", "单场死亡", "次"], ["assists", "单场助攻", "次"],
  ["last_hits", "单场补刀", "个"], ["denies", "单场反补", "个"],
  ["gold_per_min", "单场 GPM", "金/分钟"], ["xp_per_min", "单场 XPM", "经验/分钟"],
  ["net_worth", "单场经济", "金"], ["hero_damage", "单场英雄伤害", "点"],
  ["tower_damage", "单场塔伤", "点"], ["hero_healing", "单场治疗", "点"], ["kda", "单场 KDA", ""],
];

export function buildMatchRecords(matches, names = new Map(), images = new Map()) {
  const rows = [];
  const validNumber = value => typeof value === "number" && Number.isFinite(value) && value >= 0;
  for (const match of matches) {
    if (!Number.isSafeInteger(match.match_id) || !validNumber(match.start_time)) continue;
    for (const player of Array.isArray(match.players) ? match.players : []) {
      if (!player || !Number.isInteger(player.hero_id) || player.hero_id <= 0 || (names.size && !names.has(player.hero_id))) continue;
      rows.push({ player, match_id:match.match_id, start_epoch:match.start_time,
        start_time:new Date((match.start_time + 8 * 3600) * 1000).toISOString().slice(0,19).replace("T"," "),
        account_id:player.account_id ?? null, personaname:player.personaname ?? "",
        hero_name:names.get(player.hero_id) ?? `英雄 ${player.hero_id}`, hero_image:images.get(player.hero_id) ?? "" });
    }
  }
  return { match_records:metrics.map(([key,label,unit]) => ({ key,label,unit,
    rows:rows.flatMap(({player,...row}) => {
      const value = key === "kda"
        ? [player.kills,player.deaths,player.assists].every(validNumber) ? (player.kills + player.assists) / Math.max(player.deaths,1) : null
        : player[key];
      return validNumber(value) ? [{...row,value,player_slot:player.player_slot}] : [];
    }).sort((a,b) => b.value - a.value || a.start_epoch - b.start_epoch || a.match_id - b.match_id || (a.player_slot ?? 0) - (b.player_slot ?? 0))
      .slice(0,3).map((row,index) => ({...row,rank:index+1})),
  })) };
}
