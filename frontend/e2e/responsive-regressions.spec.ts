import {test, expect} from '@playwright/test';
import {fixture, installFixtureRoutes, openIncident, openWorkbench} from './support/fixtures';

for (const width of [1440, 1024, 390]) {
  test(`incident rows remain printable at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height:900});
    await installFixtureRoutes(page);
    await openWorkbench(page);
    const row = page.locator('#incident-list tbody tr, #incident-list .mobile-row').first();
    await expect(row).toBeVisible();
    await page.keyboard.press('j');
    await expect(row).toBeFocused();
    if(width===1440) await page.screenshot({path:'../outputs/ui_visual/pr2-integrated-desktop.png',fullPage:true});
    await page.emulateMedia({media:'print'});
    await expect(row).toBeVisible();
    const frame = page.locator('#incident-list .table-frame');
    if (await frame.count()) await expect(frame).toHaveCSS('max-height', 'none');
  });
}

test('phone timeline retains precise times and navigation scrolls clear', async ({page}) => {
  await page.setViewportSize({width:390, height:844});
  const time='2022-01-21T00:00:00.123456Z';
  await installFixtureRoutes(page, {timeline:{items:[{id:fixture.incidentId,kind:'alert',alert_ids:[],node_id:null,event_time:time,end_time:time,source_type:'wazuh',sensor:'test-sensor'}],page:1,page_size:20,total:1}});
  await openIncident(page);
  const timeline=page.getByRole('region',{name:'时间线对象表'});
  await expect(timeline).toBeVisible();
  await expect(timeline.locator('time')).toHaveAttribute('datetime',time);
  await expect(page.locator('.detail-nav-sticky')).toHaveCSS('position','static');
  await timeline.scrollIntoViewIfNeeded();
  await expect(timeline.getByText('test-sensor',{exact:false})).toBeVisible();
  await page.screenshot({path:'../outputs/ui_visual/pr2-integrated-phone.png',fullPage:true});
});

test('formal modules keep navigation, analysis scope and import controls', async ({page}) => {
  const aid='ana_'+'b'.repeat(64);
  const stage={stage_id:'stage_0',community_id:'scene',behavior:'EXECUTION',start_time:'2026-10-22T01:00:00Z',end_time:'2026-10-22T01:01:00Z',alert_ids:['alert_0'],alert_count:1,source_types:['edr'],evidence_summary:'observed'};
  const analysis={analysis_id:aid,algorithm_version:'attack-chain-reconstruction-v1',status:'sealed',source_stage:9,counts:{input_count:1,stage_count:1,relation_count:0,chain_count:1,directed_count:0,undirected_count:0},stages:[stage],chains:[{chain_id:'chain_0',stage_ids:['stage_0'],relation_ids:[],stage_count:1,relation_count:0,single_stage:true,has_directed_cycle:false,entry_stage_ids:[],exit_stage_ids:[]}],relations:[]};
  await page.route('**/api/v1/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    const body=path.endsWith('/stage-analyses')?{default_analysis_id:aid,items:[{analysis_id:aid,input_count:1,algorithm_version:analysis.algorithm_version}]}:path.endsWith('/stage-runs')?{items:[]}:path.endsWith('/summary')?{analysis_id:aid,summary:{counts:{input_count:1,kept_count:1,stage_count:1,host_count:0},source_type:[],source_namespace:[],source_product:[],hosts:[],behavior:[],time_series:[]}}:analysis;
    await route.fulfill({json:body});
  });
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'安全运营态势总览',exact:true})).toBeVisible();
  const nav=page.getByRole('navigation',{name:'功能模块'});
  await expect(nav.getByRole('link')).toHaveCount(6);
  await expect(page.locator('.overview-metrics')).toBeVisible();
  await page.screenshot({path:'../outputs/ui_visual/pr2-integrated-overview.png',fullPage:true});
  await nav.getByRole('link',{name:'安全告警',exact:true}).click();
  await expect(page.getByRole('heading',{name:'安全告警',exact:true})).toBeVisible();
  expect(new URL(page.url()).searchParams.get('analysis_id')).toBe(aid);
  await nav.getByRole('link',{name:'攻击链',exact:true}).click();
  await expect(page.getByRole('heading',{name:'1 条告警分析',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'导入告警',exact:true}).click();
  const drawer=page.getByRole('dialog',{name:'导入告警与分析'});
  await expect(drawer.getByLabel('选择告警文件')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'打开导航菜单',exact:true}).click();
  const navigation=page.getByRole('dialog',{name:'功能模块导航'});
  await expect(navigation.getByRole('link')).toHaveCount(7);
  await page.keyboard.press('Escape');
  await expect(navigation).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
