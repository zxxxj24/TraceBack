import {Component, Suspense, lazy, useEffect, useRef, useState, type ReactNode} from 'react';
import type {ListFilters} from './lib/route';
import type {Selection} from './components/attack-chain/ChainGraph';
import {EvidencePanel} from './components/evidence/EvidencePanel';
import {Notice} from './components/common';
import type {EvidenceSelection} from './types/domain';
import {api} from './api/client';
import {useResource} from './api/hooks';
import StageRunPanel from './components/StageRunPanel';
import type {StageRun} from './types/stageAnalysis';
import {readLocation as readLegacyLocation, routeHref} from './lib/route';
import {LayoutGrid, Bell, Boxes, GitBranch, History, Search, ShieldCheck, PanelLeftClose, PanelLeftOpen, CircleHelp} from 'lucide-react';
import {Dialog, DialogClose, DialogDescription, DialogHeader, DialogPopup, DialogTitle} from './components/ui/dialog';
import {useMediaQuery} from './lib/useMediaQuery';

const Dashboard=lazy(()=>import('./pages/Dashboard'));
const IncidentList=lazy(()=>import('./pages/IncidentList'));
const IncidentDetail=lazy(()=>import('./pages/IncidentDetail'));
const StageWorkbench=lazy(()=>import('./pages/StageWorkbench'));
const OverviewContainer=lazy(()=>import('./pages/Overview/OverviewContainer'));

export const modules = [{id:'overview',label:'态势总览'}, {id:'alerts',label:'安全告警'}, {id:'scenes',label:'攻击场景'}, {id:'stages',label:'攻击链'}, {id:'evidence',label:'证据追溯'}, {id:'records',label:'分析记录'}];

function readLocation() {
  const p = new URLSearchParams(location.search);
  return {...readLegacyLocation(),view:p.get('view') ?? '',chainId:p.get('chain_id') ?? '',stageView:p.get('view') === 'stages'};
}
function Workspace() {
  const [route,setRoute] = useState(readLocation), [evidence,setEvidence] = useState<EvidenceSelection|null>(null), [revision,setRevision] = useState(0);
  const catalog = useResource(signal => api.stageCatalog(signal), []);
  const [stageRuns,setStageRuns]=useState<StageRun[]>([]);
  const currentRun=stageRuns.find(run=>run.run_id===route.analysisId);
  const [navigationOpen,setNavigationOpen]=useState(false);
  const [helpOpen,setHelpOpen]=useState(false),[online,setOnline]=useState(()=>navigator.onLine);
  const compact=useMediaQuery('(max-width: 900px)');
  const sidebar=useRef<HTMLElement>(null);
  useEffect(()=>{
    const update=()=>setOnline(navigator.onLine);
    addEventListener('online',update);addEventListener('offline',update);
    return()=>{removeEventListener('online',update);removeEventListener('offline',update);};
  },[]);
  useEffect(()=>{
    if(!navigationOpen||!compact)return;
    const previous=document.activeElement as HTMLElement|null;
    sidebar.current?.querySelector<HTMLElement>('a,button')?.focus();
    const trap=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();setNavigationOpen(false);return;}
      if(event.key!=='Tab')return;
      const controls=sidebar.current?.querySelectorAll<HTMLElement>('a,button');
      if(!controls?.length)return;
      if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls[controls.length-1].focus();}
      else if(!event.shiftKey&&document.activeElement===controls[controls.length-1]){event.preventDefault();controls[0].focus();}
    };
    document.addEventListener('keydown',trap);
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    return()=>{document.removeEventListener('keydown',trap);document.body.style.overflow=overflow;previous?.focus();};
  },[navigationOpen,compact]);
  useEffect(()=>{
    const keyboard=(event:KeyboardEvent)=>{
      if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey)return;
      const typing=(event.target as HTMLElement)?.closest?.('input,textarea,select,[contenteditable="true"]');
      if(event.key==='?'&&!typing){event.preventDefault();setHelpOpen(true);}
      if(event.key==='Escape'){setHelpOpen(false);}
      if(event.key==='/'&&!typing&&!document.querySelector('[role="dialog"],dialog[open]')){
        const input=document.querySelector<HTMLInputElement>('[aria-label="搜索当前页"],[aria-label="搜索告警或阶段"]');
        if(input){event.preventDefault();input.focus();}
      }
      if(!typing&&!route.incidentId&&!document.querySelector('[role="dialog"],dialog[open]')&&(event.key==='j'||event.key==='k')){
        const rows=[...document.querySelectorAll<HTMLElement>('#incident-list tbody tr, #incident-list .mobile-row')];
        if(rows.length){event.preventDefault();const index=rows.indexOf(document.activeElement as HTMLElement);rows[Math.max(0,Math.min(rows.length-1,index<0?0:index+(event.key==='j'?1:-1)))]?.focus();}
      }
    };
    document.addEventListener('keydown',keyboard);return()=>document.removeEventListener('keydown',keyboard);
  },[route.incidentId]);
  // Landing view: 态势总览 is the default; StageWorkbench opens on explicit
  // view=stages; a legacy incident analysis opens when a non-stage analysis_id
  // is supplied (fallback to the old workbench).
  const isStageAnalysis = !!route.analysisId && (!!currentRun || !!catalog.data?.items?.some(item => item.analysis_id === route.analysisId));
  const moduleMode = modules.some(m => m.id === route.view && m.id !== 'stages');
  const overviewMode = !route.view && !route.analysisId || route.view === 'overview';
  const stageMode = !moduleMode && (route.stageView || isStageAnalysis);
  const activeModule = overviewMode ? 'overview' : stageMode ? 'stages' : moduleMode ? route.view : '';
  const pageTitle = modules.find(m => m.id === activeModule)?.label ?? '历史分析';
  useEffect(() => {const handler = () => {setRoute(readLocation());setEvidence(null);}; addEventListener('popstate',handler); return () => removeEventListener('popstate',handler);},[]);
  useEffect(() => {
    setEvidence(route.evidenceId && route.incidentId ? {title:'深链证据',objectId:route.nodeId||route.edgeId||route.incidentId,alertIds:[route.evidenceId]} : null);
  },[route.analysisId,route.incidentId,route.evidenceId]);
  function replaceLegacyRoute(next: typeof route) {
    history.replaceState({},'',routeHref(next));setRoute(next);
  }
  function selectLegacyObject(selection: Selection) {
    replaceLegacyRoute({...route,nodeId:selection?.kind==='node'?selection.id:'',edgeId:selection?.kind==='edge'?selection.id:''});
  }
  function closeEvidence() {
    setEvidence(null);if(route.evidenceId)replaceLegacyRoute({...route,evidenceId:''});
  }
  function navigate(a: string, i = '', filters: ListFilters = route.filters) {
    history.pushState({},'',routeHref({...route,analysisId:a,incidentId:i,filters,nodeId:'',edgeId:'',evidenceId:'',timelinePage:1})); setRoute(readLocation());setEvidence(null);window.scrollTo(0,0);
  }
  function openOverview() {
    history.pushState({},'',location.pathname+'?'); setRoute(readLocation());setEvidence(null);window.scrollTo(0,0);
  }
  function enterStage(analysisId: string, chainId = '') {
    const p = new URLSearchParams({view:'stages', analysis_id: analysisId});
    if(chainId) p.set('chain_id',chainId);
    history.pushState({},'',location.pathname+'?'+p); setRoute(readLocation());setEvidence(null);window.scrollTo(0,0);
  }
  function selectAnalysis(analysisId: string) {
    const view=activeModule && activeModule!=='records'?activeModule:'overview';
    const p=new URLSearchParams({view,analysis_id:analysisId});
    history.pushState({},'',location.pathname+'?'+p);setRoute(readLocation());setEvidence(null);window.scrollTo(0,0);
  }
  function openModule(view: string, query = '') {
    const p = new URLSearchParams();
    p.set('view',view);
    const identity=route.analysisId || catalog.data?.default_analysis_id;
    if(identity && (activeModule || isStageAnalysis || !route.analysisId)) p.set('analysis_id',identity);
    if(query) p.set('q',query);
    history.pushState({},'',location.pathname+'?'+p);setRoute(readLocation());setEvidence(null);window.scrollTo(0,0);
    setNavigationOpen(false);
  }
  const navIcons=[LayoutGrid,Bell,Boxes,GitBranch,Search,History];
  return <div className="app soc-app evidence-workbench">
    <aside ref={sidebar} className={'workbench-sidebar'+(navigationOpen?' is-open':'')} role={compact&&navigationOpen?'dialog':undefined} aria-modal={compact&&navigationOpen?true:undefined} aria-label={compact&&navigationOpen?'功能模块导航':undefined} inert={compact&&!navigationOpen}>
      <a className="workbench-brand" href="/" onClick={e=>{e.preventDefault();openOverview();setNavigationOpen(false);}}><span className="brand-mark"><ShieldCheck size={30}/></span><span>TraceBack<small>智溯 · 安全研判工作台</small></span></a>
      {compact&&<button className="workbench-menu" aria-label="关闭导航菜单" onClick={()=>setNavigationOpen(false)}><PanelLeftClose size={18}/></button>}<p className="workbench-nav-label">安全运营</p>
      <nav className="module-nav" aria-label="功能模块">{modules.map((m,index)=>{const NavIcon=navIcons[index];const link=new URLSearchParams({view:m.id});const aid=route.analysisId||catalog.data?.default_analysis_id;if(aid)link.set('analysis_id',aid);return <a key={m.id} href={'/?'+link} aria-current={activeModule===m.id?'page':undefined} onClick={e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();openModule(m.id);}}><NavIcon size={18}/><span>{m.label}</span></a>;})}</nav>
      <div className="workbench-principle"><b>算法关联与重构</b><span>告警事实与证据</span><span>AI 解释与研判</span></div>
      <div className="workbench-security-art" aria-hidden="true"><ShieldCheck size={86}/></div><p className="workbench-sidebar-footer"><span className="status-dot"/>本地分析 · 证据可追溯<br/>设备告警不等于攻击已确认</p>
    </aside>
    {navigationOpen&&<button className="workbench-nav-overlay" aria-label="关闭导航遮罩" onClick={()=>setNavigationOpen(false)}/>}
    <div className="workspace" inert={compact&&navigationOpen}><header className="soc-header"><div className="soc-header-inner"><button className="workbench-menu" aria-label={navigationOpen?'关闭导航菜单':'打开导航菜单'} aria-expanded={navigationOpen} onClick={()=>setNavigationOpen(!navigationOpen)}>{navigationOpen?<PanelLeftClose size={19}/>:<PanelLeftOpen size={19}/>}</button><div className="soc-breadcrumb">安全运营中心 <span>/</span> <b>{pageTitle}</b></div><div className="soc-header-status"><span className="status-dot"/>分析结果与证据<button aria-label="查看快捷键" className="text-button" onClick={()=>setHelpOpen(true)}><CircleHelp size={18}/></button><span className="user-avatar">T</span></div></div></header><main id="main-content" aria-label="主要内容" className={stageMode?'soc-main chain-main':'soc-main'}>
    {!online&&<div className="offline-banner" role="status">当前处于离线状态：已加载的数据仍可查看；导入与分析请求需要连接本地服务。</div>}
    <StageRunPanel catalog={catalog.data} selectedId={route.analysisId || catalog.data?.default_analysis_id || ''} view={activeModule} onSelect={selectAnalysis} onRuns={setStageRuns}>{batchControl =>
    <Suspense fallback={<Notice kind="loading">正在加载工作台…</Notice>}>{currentRun && !currentRun.result_available ? <>{overviewMode&&batchControl}<Notice kind={currentRun.status==='FAILED' || currentRun.unavailable_reason?'error':undefined}>本次结果尚不可用：{currentRun.failure_reason || currentRun.unavailable_reason || '任务尚未完成'}。点击任务状态查看进度与日志。</Notice></>
    : overviewMode || moduleMode ? <OverviewContainer key={route.analysisId || catalog.data?.default_analysis_id} catalog={catalog} batchControl={overviewMode?batchControl:undefined} view={activeModule} analysisId={route.analysisId} onNavigate={openModule} onOpenStage={enterStage}/>
    : stageMode ? <StageWorkbench key={route.analysisId} analysisId={route.analysisId} catalog={catalog.data} catalogError={catalog.error}/>
    : catalog.loading ? <Notice kind="loading">正在识别分析记录…</Notice> : route.incidentId ? <IncidentDetail key={route.analysisId+route.incidentId} analysisId={route.analysisId} incidentId={route.incidentId} initialNodeId={route.nodeId} initialEdgeId={route.edgeId} timelinePage={route.timelinePage} onSelectionChange={selectLegacyObject} onTimelinePage={page=>replaceLegacyRoute({...route,timelinePage:page})} onEvidence={setEvidence} onBack={() => navigate(route.analysisId)} onGenerated={() => setRevision(r => r+1)}/> : <><Dashboard analysisId={route.analysisId}/><IncidentList analysisId={route.analysisId} filters={route.filters} revision={revision} onFilters={filters => navigate(route.analysisId,'',filters)} onOpen={id => navigate(route.analysisId,id)}/></>}
  </Suspense>}</StageRunPanel></main></div>{evidence && <EvidencePanel key={route.analysisId+evidence.objectId+evidence.alertIds.join(',')} analysisId={route.analysisId} selection={evidence} onClose={closeEvidence}/>}<Dialog open={helpOpen} onOpenChange={setHelpOpen}><DialogPopup aria-label="键盘快捷键"><DialogHeader><DialogTitle>键盘快捷键</DialogTitle><DialogDescription>输入框内不触发快捷键；按 Esc 关闭对话框。</DialogDescription></DialogHeader><dl className="shortcut-list"><div><dt>/</dt><dd>聚焦当前页面搜索框</dd></div><div><dt>?</dt><dd>打开键盘快捷键帮助</dd></div><div><dt>j / k</dt><dd>在事件列表行之间上下移动焦点</dd></div><div><dt>Esc</dt><dd>关闭当前对话框或导航</dd></div></dl><DialogClose>关闭</DialogClose></DialogPopup></Dialog></div>;
}
class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}> {state = {failed:false};static getDerivedStateFromError(){return {failed:true};}render(){return this.state.failed ? <div className="fatal-error"><h1>页面暂时无法显示</h1><Notice kind="error">请刷新后重新打开分析。设备分析结果仍保存在后端快照中。</Notice><button onClick={() => location.reload()}>重新加载</button></div> : this.props.children;}}
export default function App() {return <ErrorBoundary><Workspace/></ErrorBoundary>;}
