async (page) => {
  const check = (ok,message) => {if(!ok)throw Error(message);};
  await page.locator('#tab-heroes').click();
  await page.waitForFunction(() => appState.data?.hero_coverage && !appState.loading);
  const coverage = await page.evaluate(() => appState.data.hero_coverage);
  for (const metric of ['win_rate','ban_rate','pick_rate']) {
    await page.locator('#heroMetricSelect').selectOption(metric);
    check(await page.evaluate(() => {
      const rows=appState.data.hero_rankings[appState.heroMetric].rows;
      const shown=[...document.querySelectorAll('#heroRankingList .podium-value, #heroRankingList .rank-value')].map(el=>el.textContent);
      return JSON.stringify(shown)===JSON.stringify(rows.map(row=>formatPercent(row.value)));
    }),`Incorrect ${metric} hero values`);
  }
  await page.locator('#heroMetricSelect').selectOption('win_rate');
  for(const [width,height,label] of [[1440,1100,'desktop'],[820,1180,'tablet'],[390,844,'mobile']]) {
    await page.setViewportSize({width,height});
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${label} overflow`);
    await page.locator('.hero-panel').screenshot({path:`output/playwright/hero-module-${label}.png`});
  }
  const edgeCases = await page.evaluate(()=>{
    const original = appState.data;
    for (const count of [0,1,2,3,10]) {
      const ranking=original.hero_rankings.win_rate;
      const rows=ranking.rows.slice(0,count).map(hero=>({...hero,hero_name:'非常长的英雄名称'.repeat(15),hero_image:''}));
      renderHeroRanking({...original,hero_rankings:{...original.hero_rankings,win_rate:{...ranking,rows}}});
      if(document.querySelectorAll('#heroRankingList .podium-place').length!==Math.min(count,3) || document.documentElement.scrollWidth>innerWidth)return false;
    }
    renderHeroRanking(original);
    return true;
  });
  check(edgeCases,'Hero podium edge cases fail');
  await page.locator('#startDate').fill('2026-05-01');
  await page.locator('#endDate').fill('2026-05-31');
  await page.waitForFunction(()=>!appState.loading&&appState.data.league.date_end==='2026-05-31');
  check(await page.evaluate(()=>appState.data.hero_coverage.total_matches===91),'Hero date scope differs');
  await page.locator('#heroMetricSelect').selectOption('ban_rate');
  check(await page.evaluate(()=>!document.getElementById('heroRankingList').textContent.includes('NaN')),'Missing BP must not create NaN');
  await page.locator('#clearDatesButton').click();
  await page.waitForFunction(()=>!appState.loading&&appState.data.league.date_end==='');
  await page.locator('#heroMetricSelect').selectOption('win_rate');
  const ids = await page.evaluate(async () => (await (await fetch('data/opendota_league_18113_seed.json')).json()).matchIds);
  let release;
  const gate = new Promise(resolve => {release=resolve;});
  await page.route('https://api.opendota.com/api/leagues/18113/matchIds',async route => {await gate;await route.fulfill({json:ids});});
  await page.locator('#syncButton').click();
  await page.waitForFunction(()=>appState.loading);
  await page.locator('#startDate').fill('2026-05-01');
  await page.locator('#endDate').fill('2026-05-31');
  release();
  await page.waitForFunction(()=>!appState.loading&&appState.data.league.date_end==='2026-05-31');
  check(await page.evaluate(()=>appState.data.hero_coverage.total_matches===91),'Changing dates during sync must preserve the latest selection');
  await page.unroute('https://api.opendota.com/api/leagues/18113/matchIds');
  await page.locator('#clearDatesButton').click();
  await page.waitForFunction(()=>!appState.loading&&appState.data.league.date_end==='');
  return {passed:true,coverage,metrics:3,viewports:[1440,820,390],checks:'three formulas, date scope, 0/1/2/3/10 heroes, missing images, long names, no NaN or overflow'};
}
