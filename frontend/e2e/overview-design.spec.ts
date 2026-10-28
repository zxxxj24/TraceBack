import AxeBuilder from '@axe-core/playwright';
import {test, expect} from '@playwright/test';

// Populated data exercises the shared batch toolbar and all ten metrics. It is
// synthetic; release screenshots are captured separately against the real API.
const aid='ana_'+'c'.repeat(64);
const secondId='ana_'+'d'.repeat(64);
const stages=Array.from({length:15},(_,i)=>({stage_id:`stage_${i}`,community_id:'community_0',behavior:'EXECUTION',start_time:`2018-11-03T17:${String(30+i).padStart(2,'0')}:00Z`,end_time:`2018-11-03T17:${String(31+i).padStart(2,'0')}:00Z`,alert_ids:[`alert_${i}`],alert_count:i===0?13:8,source_types:['edr'],evidence_summary:'Synthetic observed evidence'}));
const chains=Array.from({length:7},(_,i)=>({chain_id:`chain_${i}`,stage_ids:i===0?stages.slice(0,9).map(s=>s.stage_id):[`stage_${8+i}`],relation_ids:[],stage_count:i===0?9:1,relation_count:i===0?12:0,directed_count:i===0?9:0,undirected_count:i===0?3:0,single_stage:i!==0,has_directed_cycle:false,entry_stage_ids:[],exit_stage_ids:[]}));
const analysis={analysis_id:aid,algorithm_version:'attack-chain-reconstruction-v1',official:true,status:'sealed',source_stage:9,counts:{input_count:125,community_count:1,stage_count:15,relation_count:12,decision_count:29,chain_count:7,directed_count:9,undirected_count:3,no_relation_count:17},stages,chains,relations:[]};
const summary={analysis_id:aid,summary:{counts:{input_count:125,kept_count:125,stage_count:15,host_count:0},source_type:[],source_product:[],hosts:[],behavior:[],source_namespace:[{value:'traceback.lab.authentication',count:12},{value:'traceback.lab.edr',count:34},{value:'traceback.lab.firewall',count:20},{value:'traceback.lab.host_audit',count:15},{value:'traceback.lab.ids',count:20},{value:'traceback.lab.waf',count:24}],time_series:Array.from({length:38},(_,i)=>({time:new Date(Date.UTC(2018,10,3,17,30+i)).toISOString(),count:i===10?14:3}))}};

for(const width of [1448,390]) test(`approved overview remains usable at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:1086});
 await page.route('**/api/v1/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  const id=path.includes(secondId)?secondId:aid;
  const body=path.endsWith('/stage-analyses')?{default_analysis_id:aid,items:[{analysis_id:aid,input_count:125,official:true,algorithm_version:analysis.algorithm_version},{analysis_id:secondId,input_count:125,algorithm_version:analysis.algorithm_version}]}:path.endsWith('/stage-runs')?{items:[]}:path.endsWith('/summary')?{...summary,analysis_id:id}:{...analysis,analysis_id:id};
  await route.fulfill({json:body});
 });
 await page.goto('/');
 await expect(page.locator('.overview-metric strong')).toHaveText(['125','15','12','7','1','29','1','6','9','3']);
 await expect(page.getByLabel('历史分析')).toHaveCount(1);
 await expect(page.getByRole('heading',{name:'关系决策分布',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 if(width===1448){
  const cards=await page.locator('.overview-metric').evaluateAll(nodes=>nodes.map(n=>({x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y})));
  expect(new Set(cards.map(c=>c.y)).size).toBe(2);
  expect(new Set(cards.map(c=>c.x)).size).toBe(5);
 }
 const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']).analyze();
 expect(results.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,reason:n.failureSummary}))}))).toEqual([]);
 await page.getByLabel('历史分析').selectOption(secondId);
 await expect(page.locator('.overview-page')).toHaveAttribute('data-analysis-id',secondId);
 await page.getByRole('button',{name:'导入告警',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'导入告警与分析'})).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('button',{name:'导入告警',exact:true})).toBeFocused();
 await page.getByLabel('搜索告警或阶段').fill('stage_0');
 await page.getByRole('button',{name:'搜索',exact:true}).click();
 await expect(page.getByRole('heading',{name:'安全告警',exact:true})).toBeVisible();
 expect(new URL(page.url()).searchParams.get('q')).toBe('stage_0');
 expect(new URL(page.url()).searchParams.get('analysis_id')).toBe(secondId);
});
