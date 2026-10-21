const appState = {
  user: null,
  data: null,
  startDate: "",
  endDate: "",
  datesInitialized: false,
  metric: "win_rate",
  heroMetric: "win_rate",
  sort: "matches",
  query: "",
  matchFilter: "recent",
  loading: false,
  staticMode: false,
};

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatInteger(value) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function formatOne(value) {
  return Number(value || 0).toLocaleString("zh-CN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function formatTwo(value) {
  return Number(value || 0).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function formatMetric(value, format) {
  if (format === "percent") return formatPercent(value);
  if (format === "number2") return formatTwo(value);
  return formatOne(value);
}

function heroImages(heroes) {
  if (!heroes?.length) return '<span class="metric-muted">-</span>';
  return `<div class="hero-strip">${heroes
    .map((hero) =>
      hero.hero_image
        ? `<img src="${escapeHtml(hero.hero_image)}" alt="${escapeHtml(hero.hero_name)}" title="${escapeHtml(hero.hero_name)} x${hero.games}" loading="lazy">`
        : ""
    )
    .join("")}</div>`;
}

function setStatus(text) {
  $("statusLine").textContent = text;
}

function showLogin(message = "") {
  $("loginView").classList.remove("hidden");
  $("appHeader").classList.add("hidden");
  $("appMain").classList.add("hidden");
  $("loginError").textContent = message;
  $("loginName").focus();
}

function showApp() {
  $("loginView").classList.add("hidden");
  $("appHeader").classList.remove("hidden");
  $("appMain").classList.remove("hidden");
  $("currentUserName").textContent = appState.user?.name ?? "-";
}

async function checkAuth() {
  try {
    if (location.hostname.endsWith(".github.io")) throw new Error("静态网站");
    const response = await fetch("/api/me", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    appState.user = payload.user;
  } catch {
    if (!window.StaticBackend) throw new Error("没有可用的数据接口");
    appState.staticMode = true;
    appState.user = window.StaticBackend.currentUser();
  }
  if (appState.user) {
    showApp();
    await fetchDashboard();
  } else {
    showLogin();
  }
}

async function login(name) {
  if (appState.staticMode) {
    appState.user = window.StaticBackend.login(name);
    showApp();
    await fetchDashboard();
    return;
  }
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "登录失败");
  appState.user = payload.user;
  showApp();
  await fetchDashboard();
}

async function logout() {
  if (appState.staticMode) {
    window.StaticBackend.logout();
    appState.user = null;
    appState.data = null;
    showLogin();
    return;
  }
  await fetch("/api/logout", { method: "POST" });
  appState.user = null;
  appState.data = null;
  showLogin();
}

async function fetchDashboard({ refresh = false, wait = false } = {}) {
  if (!appState.user) {
    showLogin();
    return;
  }
  if (appState.loading) return;
  appState.loading = true;
  $("syncButton").disabled = true;
  if (refresh) setStatus("正在同步全部比赛数据，请稍候…");
  const params = new URLSearchParams();
  if (appState.startDate) params.set("startDate", appState.startDate);
  if (appState.endDate) params.set("endDate", appState.endDate);
  if (refresh) params.set("refresh", "1");
  if (wait) params.set("wait", "1");
  try {
    if (appState.staticMode) {
      let requestedPage, requestedStart, requestedEnd;
      do {
        requestedPage = advancedState.page;
        requestedStart = appState.startDate;
        requestedEnd = appState.endDate;
        appState.data = await window.StaticBackend.dashboard({
          page: requestedPage,
          startDate: requestedStart,
          endDate: requestedEnd,
          refresh,
          wait,
          autoRefresh: true,
          onUpdate: () => fetchDashboard(),
          onProgress: (message) => setStatus(`${refresh ? "手动同步" : "自动补齐"} · ${message}`),
        });
        refresh = false;
      } while (requestedPage !== advancedState.page || requestedStart !== appState.startDate || requestedEnd !== appState.endDate);
      render();
      return;
    }
    const response = await fetch(`/api/dashboard?${params.toString()}`, { cache: "no-store" });
    if (response.status === 401) {
      appState.user = null;
      showLogin("请先登录");
      return;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    appState.data = await response.json();
    render();
  } catch (error) {
    setStatus(`读取失败：${error.message}`);
  } finally {
    appState.loading = false;
    $("syncButton").disabled = false;
  }
}

function renderKpis(data) {
  const items = [
    ["日期范围", data.league.scope_label, "当前筛选"],
    ["比赛数", formatInteger(data.league.included_matches), `OpenDota ID ${formatInteger(data.league.total_match_ids)} 场`],
    ["玩家数", formatInteger(data.league.player_count), `${formatInteger(data.league.player_rows)} 条逐场记录`],
    ["排行门槛", `${data.league.ranking_min_matches} 场`, `当前比赛数的 ${Math.round(data.league.ranking_min_match_rate * 100)}%`],
    ["最新比赛", data.league.latest_match_time || "-", data.league.latest_match_id ? `#${data.league.latest_match_id}` : "-"],
    ["异常比赛", formatInteger(data.league.parse_issue_count), "players 明细不完整"],
  ];
  $("kpiGrid").innerHTML = items
    .map(([label, value, hint]) => `
      <div class="kpi">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        <small>${escapeHtml(hint)}</small>
      </div>
    `)
    .join("");
}

function renderMetricOptions(data) {
  const select = $("metricSelect");
  const previous = select.value || appState.metric;
  select.innerHTML = data.metrics
    .map((metric) => `<option value="${metric.key}">${escapeHtml(metric.label)}</option>`)
    .join("");
  appState.metric = data.metrics.some((metric) => metric.key === previous) ? previous : "win_rate";
  select.value = appState.metric;
}

function renderRanking(data) {
  const ranking = data.rankings[appState.metric] ?? data.rankings.win_rate;
  $("rankingHint").textContent = `${ranking.label} Top 10 · 已剔除少于 ${data.league.ranking_min_matches} 场的玩家`;
  const podium = ranking.rows.slice(0, 3).map((row) => `
    <article class="podium-place podium-place-${row.rank}" aria-label="第 ${row.rank} 名">
      <div class="podium-value">${formatMetric(row.value, ranking.format)}</div>
      <div class="podium-player">
        ${heroImages(row.top_heroes)}
        <strong title="${escapeHtml(row.personaname || row.account_id)}">${escapeHtml(row.personaname || row.account_id)}</strong>
        <span title="${escapeHtml(row.account_id)} · ${row.matches} 场">${escapeHtml(row.account_id)} · ${row.matches} 场</span>
      </div>
      <div class="podium-platform">
        <b>${row.rank}</b>
        <span>${["冠军", "亚军", "季军"][row.rank - 1]}</span>
      </div>
    </article>
  `).join("");
  const remaining = ranking.rows.slice(3)
    .map((row) => `
      <div class="rank-row">
        <span class="rank">${row.rank}</span>
        <div class="player-line">
          <strong title="${escapeHtml(row.personaname || row.account_id)}">${escapeHtml(row.personaname || row.account_id)}</strong>
          <span>${escapeHtml(row.account_id)} · ${row.matches} 场</span>
        </div>
        ${heroImages(row.top_heroes)}
        <div class="rank-value">${formatMetric(row.value, ranking.format)}</div>
      </div>
    `)
    .join("");
  $("rankingList").innerHTML = podium
    ? `<div class="ranking-podium">${podium}</div>${remaining}`
    : '<div class="empty-state">当前范围内暂无符合排行门槛的玩家</div>';
}

function renderHeroRanking(data) {
  const ranking = data.hero_rankings?.[appState.heroMetric];
  const coverage = data.hero_coverage;
  if (!ranking || !coverage) {
    $("heroRankingHint").textContent = "英雄统计暂不可用";
    $("heroCoverage").textContent = "";
    $("heroRankingList").innerHTML = '<div class="empty-state">暂无可用数据</div>';
    return;
  }
  $("heroRankingHint").textContent = `${ranking.label} Top 10 · ${appState.heroMetric === "win_rate" ? "所有出场英雄参与，注意样本量" : appState.heroMetric === "ban_rate" ? `按 ${coverage.bp_matches} 场有效 BP 记录统计` : `按 ${coverage.valid_matches} 场有效比赛统计`}`;
  $("heroCoverage").textContent = `本范围 ${coverage.total_matches} 场 · 选取／胜率有效 ${coverage.valid_matches} 场（排除 ${coverage.excluded_matches} 场）· BP 可用 ${coverage.bp_matches} 场（未纳入 ${coverage.bp_excluded_matches} 场）`;
  const sample = (hero) => appState.heroMetric === "ban_rate"
    ? `${hero.banned_matches} / ${coverage.bp_matches} 场禁用`
    : appState.heroMetric === "pick_rate" ? `${hero.picked_matches} / ${coverage.valid_matches} 场选取`
    : `${hero.wins} 胜 ${hero.losses} 负 · ${hero.picked_matches} 场出场`;
  const portrait = (hero) => hero.hero_image
    ? `<img class="hero-portrait" src="${escapeHtml(hero.hero_image)}" alt="${escapeHtml(hero.hero_name)}" loading="lazy">`
    : '<span class="hero-portrait hero-placeholder" aria-label="暂无英雄图片">—</span>';
  const podium = ranking.rows.slice(0,3).map(hero => `
    <article class="podium-place podium-place-${hero.rank}" aria-label="第 ${hero.rank} 名">
      <div class="podium-value">${formatPercent(hero.value)}</div>
      <div class="podium-player">
        ${portrait(hero)}
        <strong title="${escapeHtml(hero.hero_name)}">${escapeHtml(hero.hero_name)}</strong>
        <span title="${sample(hero)}">${sample(hero)}</span>
      </div>
      <div class="podium-platform"><b>${hero.rank}</b><span>${["冠军","亚军","季军"][hero.rank-1]}</span></div>
    </article>`).join("");
  const remaining = ranking.rows.slice(3).map(hero => `
    <div class="rank-row hero-rank-row">
      <span class="rank">${hero.rank}</span>${portrait(hero)}
      <div class="player-line"><strong title="${escapeHtml(hero.hero_name)}">${escapeHtml(hero.hero_name)}</strong><span>${sample(hero)}</span></div>
      <div class="rank-value">${formatPercent(hero.value)}</div>
    </div>`).join("");
  $("heroRankingList").innerHTML = podium
    ? `<div class="ranking-podium">${podium}</div>${remaining}`
    : '<div class="empty-state">暂无可用数据</div>';
}

function renderMatchRecords(data) {
  $("matchRecordsHint").textContent = `${data.league.scope_label} · ${formatInteger(data.league.included_matches)} 场比赛 · 单场个人数据`;
  const names = new Map(data.players.map(player => [player.account_id,player.personaname]));
  $("matchRecords").innerHTML = (data.match_records ?? []).map(metric => `
    <article class="record-card">
      <h3>${escapeHtml(metric.label)}</h3>
      ${metric.rows.length ? metric.rows.map(row => {
        const name = row.personaname || names.get(row.account_id) || (row.account_id == null ? "匿名玩家" : `玩家 ${row.account_id}`);
        return `<div class="record-row">
          <span class="record-rank record-rank-${row.rank}" aria-label="第 ${row.rank} 名">${row.rank}</span>
          <div class="record-body">
            <div class="record-heading"><strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong><b>${metric.key === "kda" ? formatTwo(row.value) : formatInteger(row.value)}<small>${escapeHtml(metric.unit)}</small></b></div>
            <div class="record-detail">${row.hero_image ? `<img src="${escapeHtml(row.hero_image)}" alt="" loading="lazy">` : ""}<span title="${escapeHtml(row.hero_name)}">${escapeHtml(row.hero_name)}</span><span>${row.account_id == null ? "匿名账号" : escapeHtml(row.account_id)}</span></div>
            <a class="record-match" href="https://www.opendota.com/matches/${row.match_id}" target="_blank" rel="noreferrer">${escapeHtml(row.start_time)} · #${row.match_id}</a>
          </div>
        </div>`;
      }).join("") : '<div class="empty-state">暂无可用数据</div>'}
    </article>`).join("") || '<div class="empty-state">暂无可用数据</div>';
}

function renderRecentMatches(data) {
  $("latestMatchText").textContent = data.league.latest_match_time || "-";
  $("leagueLink").href = `https://www.opendota.com/leagues/${data.league.id}`;
  $("recentMatches").innerHTML = data.recent_matches.slice(0, 12)
    .map((match) => {
      const statusClass = match.status === "OK" ? "green" : "amber";
      const standouts = match.standout_players
        .map((player) => `
          <span class="standout" title="${escapeHtml(player.personaname || player.account_id)} ${escapeHtml(player.kda_line)}">
            ${player.hero_image ? `<img class="hero-mini" src="${escapeHtml(player.hero_image)}" alt="${escapeHtml(player.hero_name)}" loading="lazy">` : ""}
            ${escapeHtml(player.kda_line)}
          </span>
        `)
        .join("");
      return `
        <div class="match-item">
          <div>
            <div class="match-title">
              <a href="${escapeHtml(match.url)}" target="_blank" rel="noreferrer">#${match.match_id}</a>
              <span class="pill ${statusClass}">${escapeHtml(match.status)}</span>
            </div>
            <div class="match-meta">
              ${escapeHtml(match.start_time)} · ${formatOne(match.duration_minutes)} 分钟 · ${escapeHtml(match.radiant_name)} vs ${escapeHtml(match.dire_name)} · ${escapeHtml(match.winner)}胜
            </div>
          </div>
          <div class="standouts">${standouts}</div>
        </div>
      `;
    })
    .join("");
}

function sortedPlayers(data) {
  const query = appState.query.trim().toLowerCase();
  const filtered = data.players.filter((player) => {
    if (!query) return true;
    return String(player.account_id).includes(query) || String(player.personaname || "").toLowerCase().includes(query);
  });
  return filtered.sort((a, b) => {
    const key = appState.sort;
    const delta = Number(a[key] || 0) - Number(b[key] || 0);
    if (delta !== 0) return -delta;
    return b.matches - a.matches || a.account_id - b.account_id;
  });
}

function renderPlayers(data) {
  const players = sortedPlayers(data);
  $("playerCountText").textContent = `${players.length} / ${data.players.length} 名玩家 · ${data.league.ranking_player_count} 人进入排行`;
  $("playerTableBody").innerHTML = players
    .map((player) => `
      <tr>
        <td>${player.account_id}</td>
        <td><strong>${escapeHtml(player.personaname || "-")}</strong></td>
        <td>${heroImages(player.top_heroes)}</td>
        <td class="num">${player.matches}</td>
        <td class="num">${player.wins}</td>
        <td class="num">${player.losses}</td>
        <td class="num">${formatPercent(player.win_rate)}</td>
        <td class="num">${formatOne(player.avg_duration_minutes)}</td>
        <td class="num">${formatTwo(player.kda)}</td>
        <td class="num">${formatOne(player.avg_kills)}</td>
        <td class="num">${formatOne(player.avg_deaths)}</td>
        <td class="num">${formatOne(player.avg_assists)}</td>
        <td class="num">${formatOne(player.avg_gold_per_min)}</td>
        <td class="num">${formatOne(player.avg_xp_per_min)}</td>
        <td class="num">${formatOne(player.avg_last_hits)}</td>
        <td class="num">${formatOne(player.avg_denies)}</td>
        <td class="num">${formatInteger(player.avg_net_worth)}</td>
        <td class="num">${formatInteger(player.avg_hero_damage)}</td>
        <td class="num">${formatInteger(player.avg_tower_damage)}</td>
        <td class="num">${formatInteger(player.avg_hero_healing)}</td>
        <td>${escapeHtml(player.latest_start_time)}</td>
      </tr>
    `)
    .join("");
}

function renderMatchTable(data) {
  const rows = appState.matchFilter === "issues" ? data.issues : data.recent_matches;
  $("matchCountText").textContent = appState.matchFilter === "issues"
    ? `${rows.length} 场异常`
    : `${rows.length} 场最近比赛`;
  $("matchTableBody").innerHTML = rows.length
    ? rows.map((match) => `
      <tr>
        <td><a class="text-link" href="${escapeHtml(match.url)}" target="_blank" rel="noreferrer">${match.match_id}</a></td>
        <td>${escapeHtml(match.start_time)}</td>
        <td class="num">${formatOne(match.duration_minutes)}</td>
        <td>${escapeHtml(match.radiant_name)}</td>
        <td>${escapeHtml(match.dire_name)}</td>
        <td>${escapeHtml(match.winner)}</td>
        <td class="num">${match.player_count}</td>
        <td class="${match.status === "OK" ? "status-ok" : "status-issue"}">${escapeHtml(match.status)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="8"><div class="empty-state">没有匹配记录</div></td></tr>`;
}

function initializeDateInputs(data) {
  const startInput = $("startDate");
  const endInput = $("endDate");
  const minDate = data.league.available_date_start || "";
  const maxDate = data.league.available_date_end || "";
  startInput.min = minDate;
  startInput.max = maxDate;
  endInput.min = minDate;
  endInput.max = maxDate;
  if (!appState.datesInitialized) {
    startInput.value = data.league.date_start || "";
    endInput.value = data.league.date_end || "";
    appState.startDate = startInput.value;
    appState.endDate = endInput.value;
    appState.datesInitialized = true;
  }
}

function render() {
  const data = appState.data;
  if (!data) return;
  const syncText = data.league.is_syncing ? "同步中" : data.league.last_error ? "同步未完成" : "数据更新于";
  const errorText = data.league.last_error ? ` · ${data.league.last_error}` : "";
  setStatus(`${data.league.scope_label} · ${data.league.data_stale ? "数据已过期 · " : ""}${syncText} ${data.league.last_sync_finished_at || "更新时间未知"}${errorText}`);
  initializeDateInputs(data);
  const page = advancedState.page;
  if (data.published_page && data.published_page !== page) return;
  if (page === "overview") renderKpis(data);
  if (page === "ranking") { renderMetricOptions(data); renderRanking(data); }
  if (page === "heroes") renderHeroRanking(data);
  if (page === "records") renderMatchRecords(data);
  if (["contribution", "support", "laning", "review"].includes(page)) renderAdvanced(data);
  if (page === "recent") renderRecentMatches(data);
  if (page === "players") renderPlayers(data);
  if (page === "matches") renderMatchTable(data);
}

function bindEvents() {
  bindAdvancedEvents();
  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = $("loginName").value.trim();
    try {
      await login(name);
    } catch (error) {
      $("loginError").textContent = error.message;
    }
  });
  $("logoutButton").addEventListener("click", () => logout());
  $("syncButton").addEventListener("click", () => fetchDashboard({ refresh: true, wait: true }));
  $("startDate").addEventListener("change", (event) => {
    appState.startDate = event.target.value;
    fetchDashboard();
  });
  $("endDate").addEventListener("change", (event) => {
    appState.endDate = event.target.value;
    fetchDashboard();
  });
  $("clearDatesButton").addEventListener("click", () => {
    appState.startDate = "";
    appState.endDate = "";
    $("startDate").value = "";
    $("endDate").value = "";
    fetchDashboard();
  });
  $("metricSelect").addEventListener("change", (event) => {
    appState.metric = event.target.value;
    renderRanking(appState.data);
  });
  $("heroMetricSelect").addEventListener("change", (event) => {
    appState.heroMetric = event.target.value;
    if (appState.data) renderHeroRanking(appState.data);
  });
  $("sortSelect").addEventListener("change", (event) => {
    appState.sort = event.target.value;
    renderPlayers(appState.data);
  });
  $("playerSearch").addEventListener("input", (event) => {
    appState.query = event.target.value;
    renderPlayers(appState.data);
  });
  $("matchFilter").addEventListener("change", (event) => {
    appState.matchFilter = event.target.value;
    renderMatchTable(appState.data);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") fetchDashboard();
  });
}

bindEvents();
checkAuth();
setInterval(() => fetchDashboard(), 60_000);
