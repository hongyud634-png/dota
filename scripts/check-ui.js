async (page) => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  if (await page.getByRole('textbox', { name: '你的昵称' }).isVisible()) {
    await page.getByRole('textbox', { name: '你的昵称' }).fill('UI验证');
    await page.getByRole('button', { name: '登录查看' }).click();
  }
  await page.waitForFunction(() => document.querySelectorAll('.podium-place').length === 3);
  const baseline = await page.evaluate(async () => {
    const original = await StaticBackend.dashboard();
    return {
      samePlayers: JSON.stringify(original.players) === JSON.stringify(appState.data.players),
      sameRankings: JSON.stringify(original.rankings) === JSON.stringify(appState.data.rankings),
      matches: original.league.included_matches,
      metrics: original.metrics.map(m => m.key),
    };
  });
  check(baseline.samePlayers && baseline.sameRankings, 'Data must match existing backend output');
  for (const metric of baseline.metrics) {
    await page.locator('#metricSelect').selectOption(metric);
    const correct = await page.evaluate(() => {
      const ranking = appState.data.rankings[appState.metric];
      const values = [...document.querySelectorAll('.podium-value, .rank-row .rank-value')].map(el => el.textContent);
      return JSON.stringify(values) === JSON.stringify(ranking.rows.map(row => formatMetric(row.value, ranking.format)));
    });
    check(correct, `Incorrect displayed values for ${metric}`);
  }
  await page.locator('#metricSelect').selectOption('win_rate');
  for (const [width, height, label] of [[1440,1100,'desktop'],[820,1180,'tablet'],[390,844,'mobile']]) {
    await page.setViewportSize({ width, height });
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      steps: [...document.querySelectorAll('.podium-platform')].map(el => ({ x:el.getBoundingClientRect().x, bottom:el.getBoundingClientRect().bottom, height:el.getBoundingClientRect().height })),
      logo: document.querySelector('.brand-block .brand-mark').getAttribute('src'),
    }));
    check(!layout.overflow, `${label}: page overflows horizontally`);
    check(layout.steps[1].x < layout.steps[0].x && layout.steps[0].x < layout.steps[2].x, `${label}: incorrect podium order`);
    check(layout.steps[0].height > layout.steps[1].height && layout.steps[1].height > layout.steps[2].height, `${label}: incorrect step heights`);
    check(layout.steps.every(step => Math.abs(step.bottom - layout.steps[0].bottom) < 1), `${label}: podium baseline differs`);
    check(layout.logo === 'assets/boxing-logo.png', 'Approved logo must stay unchanged');
    await page.screenshot({ path:`output/playwright/dota-dark-${label}.png`, fullPage:true });
    console.log(`PASS ${label}: no overflow, podium 2-1-3, shared baseline, original logo`);
  }
  await page.locator('#startDate').fill('2026-05-01');
  await page.locator('#endDate').fill('2026-05-31');
  await page.waitForFunction(() => !appState.loading && appState.data.league.date_end === '2026-05-31');
  check(await page.evaluate(() => appState.data.league.included_matches === 91), 'May date filtering differs');
  await page.locator('#clearDatesButton').click();
  await page.waitForFunction(() => !appState.loading && appState.data.league.date_end === '');
  check(await page.evaluate(() => appState.data.league.included_matches) === baseline.matches, 'Clearing dates must restore all matches');
  await page.locator('#playerSearch').fill('NO_SUCH_PLAYER_UI_CHECK');
  check(await page.locator('#playerTableBody tr').count() === 0, 'Search must filter rows');
  await page.locator('#playerSearch').fill('');
  await page.locator('#sortSelect').selectOption('avg_gold_per_min');
  check(await page.evaluate(() => document.querySelector('#playerTableBody tr td').textContent === String(sortedPlayers(appState.data)[0].account_id)), 'Player sorting differs');
  await page.locator('#matchFilter').selectOption('issues');
  check(await page.evaluate(() => document.querySelectorAll('#matchTableBody tr').length === Math.max(1,appState.data.issues.length)), 'Issue filter differs');
  await page.locator('#matchFilter').selectOption('recent');
  const ids = await page.evaluate(async () => (await (await fetch('data/opendota_league_18113_seed.json')).json()).matchIds);
  await page.route('https://api.opendota.com/api/leagues/18113/matchIds', route => route.fulfill({ json:ids }));
  await page.locator('#syncButton').click();
  await page.waitForFunction(() => !appState.loading);
  check(await page.evaluate(() => appState.data.league.last_error === null), 'Manual sync failed');
  await page.unroute('https://api.opendota.com/api/leagues/18113/matchIds');
  await page.locator('#logoutButton').click();
  await page.waitForFunction(() => !document.getElementById('loginView').classList.contains('hidden'));
  await page.getByRole('textbox', { name:'你的昵称' }).fill('UI验证');
  await page.getByRole('button', { name:'登录查看' }).click();
  await page.waitForFunction(() => !document.getElementById('appMain').classList.contains('hidden') && !appState.loading);
  const edgeCases = await page.evaluate(() => {
    for (const count of [0,1,2,3,10]) {
      const key = appState.metric;
      const ranking = appState.data.rankings[key];
      const rows = ranking.rows.slice(0,count).map(row => ({...row, personaname:'长昵称'.repeat(30), top_heroes:[]}));
      renderRanking({...appState.data, rankings:{...appState.data.rankings,[key]:{...ranking,rows}}});
      if (document.documentElement.scrollWidth > innerWidth || document.querySelectorAll('.podium-place').length !== Math.min(count,3)) return false;
    }
    renderRanking(appState.data);
    return true;
  });
  check(edgeCases, 'Small player counts, long names or missing heroes break mobile layout');
  console.log(`PASS: ${baseline.metrics.length} metric formats, unchanged backend output, dates/clear, search/sort, issue filter, manual sync and logout/login`);
  return { passed:true, metrics:baseline.metrics.length, matches:baseline.matches, viewports:[1440,820,390], checks:'data equality, podium order/heights/baseline, no overflow, date filters, search, sort, manual sync, login/logout, 0/1/2/3/10 players, long names, missing heroes' };
}
