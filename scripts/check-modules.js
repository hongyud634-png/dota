async (page) => {
  if(await page.locator('#loginName').isVisible()) {
    await page.locator('#loginName').fill('模块检查');
    await page.locator('#loginForm button').click();
  }
  await page.waitForFunction(()=>appState.data?.league);
  const ready=()=>page.waitForFunction(()=>!appState.loading && (!appState.data.published_page || appState.data.published_page===advancedState.page));
  const tabs=await page.locator('#moduleTabs [role=tab]').count();
  if(tabs!==11) throw Error(`Expected 11 tabs, found ${tabs}`);
  for(const tab of await page.locator('#moduleTabs [role=tab]').all()) {
    await tab.click();await ready();
    if(await page.locator('[role=tabpanel]:visible').count()!==1) throw Error('More than one module visible');
  }
  for(const [group,metrics] of [['contribution',6],['support',7],['laning',5]]) {
    await page.locator(`#tab-${group}`).click();await ready();
    const options=await page.locator(`#${group}Metric option`).all();
    if(options.length!==metrics) throw Error('Missing metrics');
    for(const option of options) await page.locator(`#${group}Metric`).selectOption(await option.getAttribute('value'));
    if(await page.locator(`#${group}Ranking .rank-row`).count()===0) throw Error(`No ${group} results`);
  }
  await page.locator('#laneRole').selectOption('2');
  if(!await page.locator('#laningCoverage').innerText()) throw Error('Missing coverage');
  await page.locator('#laneRole').selectOption('');
  await page.locator('#tab-review').click();await ready();
  await page.waitForFunction(()=>advancedState.review?.match_id===advancedState.reviewId);
  if(await page.locator('.review-chart').count()!==2) throw Error('Missing curves');
  if(await page.locator('#fightSelect option').count()<1) throw Error('Missing fights');
  if(await page.locator('#fightSelect option').count()>1) await page.locator('#fightSelect').selectOption('1');
  if(!await page.locator('.objective-timeline li').count()) throw Error('Missing objectives');
  for(const width of [1440,820,390]) {
    await page.setViewportSize({width,height:1000});
    for(const name of ['overview','ranking','heroes','records','contribution','support','laning','review','players','matches','recent']) {
      await page.locator(`#tab-${name}`).click();await ready();
      if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw Error(`Overflow ${name} at ${width}`);
    }
    await page.locator('#tab-contribution').click();await ready();
    await page.screenshot({path:`output/playwright/contribution-${width}.png`,fullPage:true});
    await page.locator('#tab-review').click();await ready();
    await page.screenshot({path:`output/playwright/review-${width}.png`,fullPage:true});
  }
  await page.locator('#tab-laning').click();await ready();
  await page.locator('#laneHero').selectOption(await page.locator('#laneHero option').nth(1).getAttribute('value'));
  if(await page.locator('#laningRanking .rank-row').count()===0) throw Error('Hero filter removed all known samples');
  await page.locator('#laneHero').selectOption('');
  await page.locator('#startDate').fill('2026-05-01');
  await page.locator('#startDate').dispatchEvent('change');
  await page.locator('#endDate').fill('2026-05-31');
  await page.locator('#endDate').dispatchEvent('change');
  await page.waitForFunction(()=>appState.data.league.date_start==='2026-05-01'&&appState.data.league.date_end==='2026-05-31');
  await page.locator('#tab-review').click();await ready();
  await page.waitForFunction(()=>advancedState.review?.match_id===advancedState.reviewId);
  if(!await page.evaluate(()=>advancedState.review.start_time.startsWith('2026-05'))) throw Error('Review date scope');
  await page.locator('#startDate').fill('2000-01-01');
  await page.locator('#startDate').dispatchEvent('change');
  await page.locator('#endDate').fill('2000-01-02');
  await page.locator('#endDate').dispatchEvent('change');
  await page.waitForFunction(()=>appState.data.league.date_end==='2000-01-02');
  await page.locator('#tab-support').click();await ready();
  if(await page.locator('#supportRanking .empty-state').count()!==1) throw Error('Missing empty state');
  await page.locator('#clearDatesButton').click();
  await page.waitForFunction(()=>appState.data.league.date_start===''&&appState.data.league.date_end==='');
  await page.locator('#tab-overview').click();await ready();
  await page.locator('#tab-overview').press('ArrowRight');
  if(await page.locator('#tab-ranking').getAttribute('aria-selected')!=='true') throw Error('Keyboard navigation');
  return {passed:true,tabs,metrics:18,viewports:[1440,820,390],dateScopes:true,emptyStates:true,keyboard:true,coverage:await page.evaluate(()=>({all:appState.data.advanced_stats.total_matches,parsed:appState.data.advanced_stats.parsed_matches}))};
}
