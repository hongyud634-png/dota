// A missing or conflicting draft must not be counted as a game with zero bans.
export function draftBans(match, heroes = new Map()) {
  const draft = match.picks_bans;
  if (!Array.isArray(draft) || draft.some(p => !p || typeof p.is_pick !== "boolean" || !Number.isInteger(p.hero_id) || p.hero_id <= 0 || (heroes.size && !heroes.has(p.hero_id)) || ![0, 1].includes(p.team))) return null;
  const picks = draft.filter(p => p.is_pick);
  const bans = new Set(draft.filter(p => !p.is_pick).map(p => p.hero_id));
  if (picks.length !== 10 || new Set(picks.map(p => p.hero_id)).size !== 10 || picks.filter(p => p.team === 0).length !== 5 || !bans.size || picks.some(p => bans.has(p.hero_id))) return null;
  return bans;
}

export function buildHeroStats(matches, names = new Map(), images = new Map()) {
  const heroes = new Map();
  let validMatches = 0;
  let bpMatches = 0;
  const get = id => {
    if (!heroes.has(id)) heroes.set(id, { hero_id:id, hero_name:names.get(id) ?? `英雄 ${id}`, hero_image:images.get(id) ?? "", picked_matches:0, wins:0, losses:0, banned_matches:0 });
    return heroes.get(id);
  };
  for (const match of matches) {
    const players = match.players;
    const valid = Array.isArray(players) && players.length === 10 && typeof match.radiant_win === "boolean"
      && players.every(p => p && Number.isInteger(p.hero_id) && p.hero_id > 0 && (!names.size || names.has(p.hero_id)))
      && new Set(players.map(p => p.hero_id)).size === 10
      && new Set(players.map(p => p.player_slot)).size === 10
      && players.every(p => [0,1,2,3,4,128,129,130,131,132].includes(p.player_slot))
      && players.filter(p => p.player_slot < 128).length === 5;
    if (valid) {
      validMatches++;
      for (const player of players) {
        const hero = get(player.hero_id);
        const won = (player.player_slot < 128) === match.radiant_win;
        hero.picked_matches++;
        hero.wins += won ? 1 : 0;
        hero.losses += won ? 0 : 1;
      }
    }
    const bans = draftBans(match, names);
    if (bans) {
      bpMatches++;
      for (const id of bans) get(id).banned_matches++;
    }
  }
  const stats = [...heroes.values()].sort((a,b) => a.hero_id - b.hero_id).map(hero => ({ ...hero,
    win_rate:hero.picked_matches ? hero.wins / hero.picked_matches : null,
    pick_rate:validMatches ? hero.picked_matches / validMatches : null,
    ban_rate:bpMatches ? hero.banned_matches / bpMatches : null,
  }));
  const rankings = Object.fromEntries([
    ["win_rate","英雄胜率","picked_matches"], ["ban_rate","英雄 Ban 率","banned_matches"], ["pick_rate","英雄选取率","picked_matches"],
  ].map(([key,label,count]) => [key, { key,label,format:"percent",rows:stats.filter(h => h[count] > 0 && h[key] !== null)
    .sort((a,b) => b[key] - a[key] || b[count] - a[count] || a.hero_id - b.hero_id)
    .slice(0,10).map((hero,index) => ({...hero,rank:index+1,value:hero[key]})) }]));
  return { hero_stats:stats, hero_rankings:rankings, hero_coverage:{ total_matches:matches.length, valid_matches:validMatches,
    excluded_matches:matches.length-validMatches, bp_matches:bpMatches, bp_excluded_matches:matches.length-bpMatches } };
}
