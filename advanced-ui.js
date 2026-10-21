const advancedState = {page:"overview",metrics:{},laneHero:"",laneRole:"",reviewId:null,review:null,reviewKey:null,reviewCache:new Map(),fight:0,request:0};

function selectModule(page, focus = false) {
  const panels = [...document.querySelectorAll("[data-page]")];
  if (!panels.some(panel=>panel.dataset.page===page)) page="overview";
  advancedState.page=page;
  for (const panel of panels) panel.hidden=panel.dataset.page!==page;
  for (const tab of document.querySelectorAll("#moduleTabs [role=tab]")) {
    const active=tab.dataset.pageLink===page;
    tab.setAttribute("aria-selected",String(active));
    tab.tabIndex=active?0:-1;
    if(active && focus) {tab.focus();tab.scrollIntoView({block:"nearest",inline:"nearest"});}
  }
  if(location.hash!==`#${page}`) location.hash=page;
  if(page==="review" && appState.data) loadReview();
}

function advancedValue(value,format) {
  if(value == null || !Number.isFinite(value)) return "—";
  if(format==="integer") return formatInteger(value);
  return format==="pct100" ? `${formatOne(value)}%` : format==="percent" ? `${formatOne(value*100)}%` : formatMetric(value,format);
}

function renderAdvancedRanking(group) {
  const data=appState.data;
  const stats=data?.advanced_stats;
  const metric=stats?.[group]?.metrics.find(metric=>metric.key===advancedState.metrics[group]);
  if(!metric) { $(`${group}Ranking`).innerHTML='<div class="empty-state">暂无可用数据</div>';return; }
  let rows=metric.rows;
  let validMatches=metric.valid_matches;
  if(group==="laning") {
    const selected=stats.laning.records.filter(row=>(!advancedState.laneHero || row.hero_id===Number(advancedState.laneHero))
      && (!advancedState.laneRole || row.lane_role===Number(advancedState.laneRole)) && Number.isFinite(row.values[metric.key]));
    validMatches=new Set(selected.map(row=>row.match_id)).size;
    const aggregates=new Map();
    for(const row of selected) {
      if(!aggregates.has(row.account_id)) aggregates.set(row.account_id,{account_id:row.account_id,personaname:row.personaname,matches:0,sum:0});
      const player=aggregates.get(row.account_id);
      player.matches++;player.sum+=row.values[metric.key];
      if(row.personaname) player.personaname=row.personaname;
    }
    rows=[...aggregates.values()].map(row=>({...row,value:row.sum/row.matches}))
      .sort((a,b)=>b.value-a.value || b.matches-a.matches || a.account_id-b.account_id).map((row,index)=>({...row,rank:index+1}));
  }
  $(`${group}Coverage`).textContent=`${data.league.scope_label} · 共 ${stats.total_matches} 场 · 当前指标有效 ${validMatches} 场 · 未纳入 ${stats.total_matches-validMatches} 场${group==="laning" ? "（含筛选排除）" : ""} · 每位玩家的有效场次见下方`;
  $(`${group}Formula`).textContent=`${metric.hint} 同值按有效场次、账号排序；所有有有效记录的玩家参与。`;
  const names=new Map(data.players.map(player=>[player.account_id,player.personaname]));
  $(`${group}Ranking`).innerHTML=rows.slice(0,10).map(row=>{
    const name=names.get(row.account_id) || row.personaname || `玩家 ${row.account_id}`;
    return `<div class="rank-row"><span class="rank">${row.rank}</span><div class="player-line"><strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong><span>${row.account_id} · 有效 ${row.matches} 场</span></div><div class="rank-value">${advancedValue(row.value,metric.format)}</div></div>`;
  }).join("") || '<div class="empty-state">当前范围与筛选下暂无可用解析记录</div>';
}

function renderAdvanced(data) {
  const stats=data.advanced_stats;
  for(const group of ["contribution","support","laning"]) {
    const select=$(`${group}Metric`);
    const metrics=stats?.[group]?.metrics ?? [];
    if(!metrics.some(metric=>metric.key===advancedState.metrics[group])) advancedState.metrics[group]=metrics[0]?.key;
    select.innerHTML=metrics.map(metric=>`<option value="${metric.key}">${escapeHtml(metric.label)}</option>`).join("");
    select.value=advancedState.metrics[group] ?? "";
  }
  const heroes=[...(stats?.laning.heroes ?? [])];
  if(advancedState.laneHero && !heroes.some(hero=>hero.id===Number(advancedState.laneHero))) heroes.push({id:Number(advancedState.laneHero),name:advancedState.laneHeroName || `英雄 ${advancedState.laneHero}`});
  $("laneHero").innerHTML='<option value="">全部英雄</option>'+heroes.map(hero=>`<option value="${hero.id}">${escapeHtml(hero.name)}</option>`).join("");
  $("laneHero").value=advancedState.laneHero;
  for(const group of ["contribution","support","laning"]) renderAdvancedRanking(group);
  const matches=stats?.review_matches ?? [];
  if(!matches.some(match=>match.match_id===advancedState.reviewId)) advancedState.reviewId=matches[0]?.match_id ?? null;
  $("reviewMatchSelect").innerHTML=matches.length ? matches.map(match=>`<option value="${match.match_id}">${escapeHtml(match.start_time)} · #${match.match_id}${match.parsed ? "" : match.checked ? " · 暂无解析" : " · 解析待确认"}</option>`).join("") : '<option value="">当前范围暂无比赛</option>';
  $("reviewMatchSelect").value=advancedState.reviewId ?? "";
  if(advancedState.page==="review") loadReview();
}

function reviewTime(seconds) {
  if(!Number.isFinite(seconds)) return "—";
  const negative=seconds<0?"−":"";
  seconds=Math.floor(Math.abs(seconds));
  return `${negative}${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}`;
}

function reviewPortrait(player) {
  return player.hero_image ? `<img class="hero-mini" src="${escapeHtml(player.hero_image)}" alt="" loading="lazy" onerror="this.hidden=true">` : "";
}

async function loadReview(force=false) {
  const id=advancedState.reviewId;
  const version=appState.data?.league.last_sync_finished_at ?? "";
  const key=`${id}:${version}`;
  if(!force && advancedState.reviewKey===key) return;
  advancedState.reviewKey=key;
  const request=++advancedState.request;
  advancedState.review=null;
  $("reviewContent").innerHTML="";
  if(!id) { $("reviewStatus").textContent="当前日期范围内暂无比赛";return; }
  $("reviewStatus").textContent=`正在读取 #${id} 的详细复盘…`;
  try {
    if(force) advancedState.reviewCache.delete(key);
    if(!advancedState.reviewCache.has(key)) {
      advancedState.reviewCache.set(key,(async()=>{
        const response=await fetch(new URL(`data/analysis/${id}.json`,document.baseURI),{cache:"no-store",signal:AbortSignal.timeout(25000)});
        if(response.ok) return await response.json();
        if(response.status!==404) throw Error(`复盘文件暂不可用（${response.status}）`);
        const rawResponse=await fetch(`https://api.opendota.com/api/matches/${id}`,{signal:AbortSignal.timeout(30000)});
        if(!rawResponse.ok) throw Error(`OpenDota 暂不可用（${rawResponse.status}）`);
        const raw=await rawResponse.json();
        if(Number(raw.match_id)!==id || Number(raw.leagueid)!==18113) throw Error("比赛信息不匹配");
        const module=await window.advancedStatsReady;
        const heroes=new Map(Object.values(appState.data.hero_stats ?? []).map(hero=>[hero.hero_id,hero.hero_name]));
        const images=new Map(Object.values(appState.data.hero_stats ?? []).map(hero=>[hero.hero_id,hero.hero_image]));
        return module.buildReview(raw,heroes,images);
      })());
    }
    const review=await advancedState.reviewCache.get(key);
    if(Number(review.match_id)!==id || Number(review.leagueid)!==18113) throw Error("复盘数据不匹配");
    if(request!==advancedState.request || id!==advancedState.reviewId) return;
    advancedState.review=review;
    advancedState.fight=Math.min(advancedState.fight,Math.max(0,review.fights.length-1));
    renderReview();
  } catch(error) {
    advancedState.reviewCache.delete(key);
    if(request!==advancedState.request || id!==advancedState.reviewId) return;
    advancedState.reviewKey=null;
    $("reviewStatus").textContent=`#${id} 读取未完成：${error.message}`;
    $("reviewContent").innerHTML='<div class="empty-state">已保留其他模块的数据。<button id="reviewRetry" class="icon-button command">重新读取复盘</button></div>';
  }
}

function reviewChart(points,key,label,color) {
  const valid=points.filter(p=>Number.isFinite(p[key]));
  if(valid.length<2) return `<section class="review-block"><h3>${label}</h3><div class="empty-state">暂无可用曲线</div></section>`;
  const max=Math.max(1,...valid.map(p=>Math.abs(p[key])));
  const end=Math.max(1,...valid.map(p=>p.minute));
  const x=minute=>58+minute/end*660,y=value=>126-value/max*90;
  const segments=[];
  let segment=[];
  for(const point of points) {
    if(Number.isFinite(point[key])) segment.push(`${x(point.minute).toFixed(1)},${y(point[key]).toFixed(1)}`);
    else {if(segment.length) segments.push(segment);segment=[];}
  }
  if(segment.length) segments.push(segment);
  return `<section class="review-block"><h3>${label}</h3><p class="advanced-note">正值代表天辉领先，负值代表夜魇领先。拖动滑块读取每分钟数值。</p>
    <svg class="review-chart" viewBox="0 0 750 250" role="img" aria-label="${label}，最高绝对优势 ${formatInteger(max)}，共 ${end} 分钟">
      ${[-1,0,1].map(f=>`<line x1="58" y1="${y(f*max)}" x2="718" y2="${y(f*max)}" stroke="var(--line)"/><text x="50" y="${y(f*max)+4}" text-anchor="end">${formatInteger(f*max)}</text>`).join("")}
      ${segments.map(s=>`<polyline points="${s.join(" ")}" fill="none" stroke="${color}" stroke-width="2.5"/>`).join("")}
      ${valid.map(p=>`<circle cx="${x(p.minute)}" cy="${y(p[key])}" r="4" fill="${color}"><title>${p.minute} 分钟：${formatInteger(p[key])}</title></circle>`).join("")}
      ${[0,end/2,end].map(min=>`<text x="${x(min)}" y="241" text-anchor="middle">${formatOne(min)} 分钟</text>`).join("")}
    </svg><label class="chart-sampler">查看时间点<input type="range" data-curve="${key}" min="0" max="${end}" step="1" value="0" aria-label="${label}采样时刻"><output id="curveValue-${key}">0 分钟：${advancedValue(points[0]?.[key],"integer")}</output></label><div class="chart-extrema">天辉最大领先 ${formatInteger(Math.max(0,...valid.map(p=>p[key])))} · 夜魇最大领先 ${formatInteger(Math.max(0,...valid.map(p=>-p[key])))}</div></section>`;
}

function objectiveTarget(target) {
  if(!target) return "";
  const side=target.includes("goodguys")?"天辉":target.includes("badguys")?"夜魇":"";
  const lane=target.endsWith("_top")?"上路":target.endsWith("_mid")?"中路":target.endsWith("_bot")?"下路":"";
  const tower=target.match(/tower(\d)/);
  return tower ? `${side}${lane}${tower[1]} 塔` : /rax_melee|melee_rax/.test(target) ? `${side}${lane}近战兵营` : /rax_range|range_rax/.test(target) ? `${side}${lane}远程兵营` : target.includes("fort") ? `${side}远古遗迹` : `${side}${lane}建筑`;
}

function renderFight() {
  const review=advancedState.review;
  const fight=review?.fights[advancedState.fight];
  if(!fight) return '<div class="empty-state">暂无可用团战记录</div>';
  const total=(side,key)=>{
    const players=fight.players.filter(player=>(player.player_slot<128)===side);
    return players.length===5 && players.every(p=>Number.isFinite(p[key])) ? players.reduce((sum,p)=>sum+p[key],0) : null;
  };
  return `<p class="advanced-note">${reviewTime(fight.start)}–${reviewTime(fight.end)}。团战由 OpenDota 自动识别，部分交战可能未被归类。</p>
    <div class="fight-summary">${[true,false].map(side=>`<div><strong>${side?"天辉":"夜魇"}</strong><span>阵亡 ${advancedValue(total(side,"deaths"),"integer")} · 伤害 ${advancedValue(total(side,"damage"),"integer")}</span><span>治疗 ${advancedValue(total(side,"healing"),"integer")} · 经济变化 ${advancedValue(total(side,"gold_delta"),"integer")}</span></div>`).join("")}</div>
    <div class="table-wrap"><table><thead><tr><th>玩家／英雄</th><th>阵营</th><th>阵亡</th><th>伤害</th><th>治疗</th><th>经济变化</th><th>经验变化</th></tr></thead><tbody>${fight.players.map(p=>`<tr><td>${reviewPortrait(p)}${escapeHtml(p.personaname || p.account_id || "匿名玩家")}<br><span class="metric-muted">${escapeHtml(p.hero_name)}</span></td><td>${p.player_slot<128?"天辉":"夜魇"}</td>${["deaths","damage","healing","gold_delta","xp_delta"].map(key=>`<td>${advancedValue(p[key],"integer")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function renderReview() {
  const review=advancedState.review;
  if(!review) return;
  const winner=typeof review.radiant_win==="boolean" ? `${review.radiant_win?"天辉":"夜魇"}获胜` : "胜负未记录";
  $("reviewStatus").textContent=`#${review.match_id} · ${review.start_time} · ${reviewTime(review.duration)} · ${winner} · ${review.parsed ? "已有详细解析" : "暂无录像解析，仅显示已有事件"}`;
  const itemRows=review.players.map(p=>`<tr><td>${reviewPortrait(p)}${escapeHtml(p.personaname || p.account_id || "匿名玩家")}<br><span class="metric-muted">${escapeHtml(p.hero_name)}</span></td><td>${p.player_slot<128?"天辉":"夜魇"}</td><td>${p.items.length ? p.items.map(item=>`<span class="item-timing"><b>${reviewTime(item.time)}</b> ${escapeHtml(item.name)}</span>`).join("") : '<span class="metric-muted">无可用关键装备购买记录</span>'}</td></tr>`).join("");
  $("reviewContent").innerHTML=`<div class="review-intro"><span>${escapeHtml(review.radiant_name)} vs ${escapeHtml(review.dire_name)}</span><a class="text-link" href="https://www.opendota.com/matches/${review.match_id}" target="_blank" rel="noreferrer">查看 OpenDota 原始比赛</a></div>
    <div class="review-kpis"><div><span>天辉最大经济领先</span><strong>${advancedValue(review.radiant_lead,"integer")}</strong></div><div><span>夜魇最大经济领先</span><strong>${advancedValue(review.dire_lead,"integer")}</strong></div><div><span>获胜方曾最大经济落后</span><strong>${advancedValue(review.comeback,"integer")}</strong></div></div>
    <div class="review-charts">${reviewChart(review.curves,"gold","经济优势曲线","#e6bf79")}${reviewChart(review.curves,"xp","经验优势曲线","#8cc2f1")}</div>
    <section class="review-block"><h3>关键装备时间</h3><p class="advanced-note">展示完整装备的购买日志，保留重复购买；配方与组件不作为成型时间。缺少日志不代表没有购买。</p><div class="table-wrap"><table><thead><tr><th>玩家／英雄</th><th>阵营</th><th>关键装备购买记录</th></tr></thead><tbody>${itemRows}</tbody></table></div></section>
    <section class="review-block"><div class="review-subhead"><h3>团战复盘</h3><select id="fightSelect" aria-label="选择团战">${review.fights.length ? review.fights.map((fight,index)=>`<option value="${index}">第 ${index+1} 波 · ${reviewTime(fight.start)}–${reviewTime(fight.end)}</option>`).join("") : '<option value="">暂无团战</option>'}</select></div><div id="fightContent">${renderFight()}</div></section>
    <section class="review-block"><h3>目标事件时间线</h3>${review.objectives.length ? `<ol class="objective-timeline">${review.objectives.map(event=>{
      const player=review.players.find(p=>p.player_slot===event.player_slot);
      const actor=player ? `${player.player_slot<128?"天辉":"夜魇"} · ${player.personaname || player.account_id || player.hero_name}` : event.side || "事件方未记录";
      return `<li><time>${reviewTime(event.time)}</time><div><strong>${escapeHtml(event.label)}${event.target ? ` · ${escapeHtml(objectiveTarget(event.target))}` : ""}</strong><span>${escapeHtml(actor)}</span></div></li>`;
    }).join("")}</ol>` : '<div class="empty-state">暂无可用目标事件记录</div>'}</section>`;
  $("fightSelect").value=String(advancedState.fight);
}

function bindAdvancedEvents() {
  const panels=[...document.querySelectorAll("[data-page]")];
  $("moduleTabs").innerHTML=panels.map(panel=>{
    const page=panel.dataset.page;
    if(page!=="overview") panel.id=`page-${page}`;
    panel.setAttribute("aria-labelledby",`tab-${page}`);
    return `<button id="tab-${page}" role="tab" data-page-link="${page}" aria-controls="${panel.id}" aria-selected="false" tabindex="-1">${escapeHtml(panel.dataset.title)}</button>`;
  }).join("");
  $("moduleTabs").addEventListener("click",event=>{const tab=event.target.closest("[role=tab]");if(tab) selectModule(tab.dataset.pageLink,true);});
  $("moduleTabs").addEventListener("keydown",event=>{
    const tabs=[...$("moduleTabs").querySelectorAll("[role=tab]")];
    const index=tabs.indexOf(event.target);
    if(index<0 || !["ArrowRight","ArrowLeft","Home","End"].includes(event.key)) return;
    event.preventDefault();
    const target=event.key==="Home"?0:event.key==="End"?tabs.length-1:(index+(event.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length;
    selectModule(tabs[target].dataset.pageLink,true);
  });
  window.addEventListener("hashchange",()=>selectModule(location.hash.slice(1)));
  for(const group of ["contribution","support","laning"]) $(`${group}Metric`).addEventListener("change",event=>{advancedState.metrics[group]=event.target.value;renderAdvancedRanking(group);});
  $("laneHero").addEventListener("change",event=>{advancedState.laneHero=event.target.value;advancedState.laneHeroName=event.target.selectedOptions[0]?.textContent;renderAdvancedRanking("laning");});
  $("laneRole").addEventListener("change",event=>{advancedState.laneRole=event.target.value;renderAdvancedRanking("laning");});
  $("reviewMatchSelect").addEventListener("change",event=>{advancedState.reviewId=Number(event.target.value)||null;advancedState.fight=0;loadReview();});
  $("reviewContent").addEventListener("change",event=>{if(event.target.id==="fightSelect") {advancedState.fight=Number(event.target.value);$("fightContent").innerHTML=renderFight();}});
  $("reviewContent").addEventListener("click",event=>{if(event.target.closest("#reviewRetry")) loadReview(true);});
  $("reviewContent").addEventListener("input",event=>{
    const key=event.target.dataset.curve;
    if(!["gold","xp"].includes(key)) return;
    const minute=Number(event.target.value);
    const point=advancedState.review?.curves.find(p=>p.minute===minute);
    $(`curveValue-${key}`).textContent=`${minute} 分钟：${advancedValue(point?.[key],"integer")}`;
  });
  selectModule(location.hash.slice(1));
}
