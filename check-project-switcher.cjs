const fs=require('fs'),assert=require('assert/strict');
let currentProps={},hidden=false,calls=[],closed=[],opened=[],nodes=[],labels=[],state={};
function element(){const node={};nodes.push(node);let proxy;proxy=new Proxy({}, {get:(_target,key)=>{
 if(key==='when')return (condition,fn)=>condition?fn(proxy):proxy;
 if(key==='id')return id=>{node.id=id;return proxy;};
 if(key==='on_click')return fn=>{node.click=fn;return proxy;};
 if(key==='child')return value=>{if(typeof value==='string')labels.push(value);return proxy;};
 return ()=>proxy;
}});return proxy;}
const space={id:'project',active:true,machine:null,folder:'/repo',name:'Repo',tabs:[{id:'work',name:'Planner',active:true}]};
const agent={address:'t1',space:'project',tab:'work',tab_name:'Planner',pane:'agent-pane',program:{agent:true,name:'Codex'},status:'working'};
const paneList=[{pane:'agent-pane',terminal:'t1',tab:'work',program:agent.program},
 {pane:'shell-pane',terminal:'t2',tab:'work',cwd:'/repo',program:{shell:true,name:'zsh'}}];
let spaceList=[space];
const env={View:class{},div:element,svg:element,image:element,h_flex:element,v_flex:element,theme:()=>({}),
 spaces:()=>spaceList,agents:()=>[agent],panes:()=>paneList,terminals:()=>[],props:()=>currentProps,
 shared:key=>state[key],setShared:(key,value)=>{state[key]=value;},setAgentOrder:()=>{},
 run:(command,args)=>calls.push({command,args}),closeOverlay:id=>closed.push(id),openOverlay:options=>opened.push(options),
 window:()=>({platform:'linux',buttons:false}),settings:()=>({zoom:1}),
 layout:()=>({id:'root',children:[{id:'sidebar',hidden,size:{px:268}}]})};
function load(mod,name){const s=fs.readFileSync(`${__dirname}/${mod}/main.js`,'utf8').replace(/^import .*;\n/gm,'').replace(`export default class ${name}`,`class ${name}`);return new Function('env',`const {${Object.keys(env).join(',')}}=env;${s};return ${name};`)(env);}
const Tabs=load('project-tabs','Tabs'),Hub=load('project-hub','ProjectHub');
const tabs=new Tabs();tabs.panels={};
function reset(){nodes=[];labels=[];calls=[];closed=[];opened=[];}
tabs.render();assert.ok(!nodes.some(n=>n.id==='project-switcher'),'no duplicate switcher when sidebar is visible');
hidden=true;reset();tabs.render();
nodes.find(n=>n.id==='project-switcher').click();
assert.equal(opened[0].mod,'project-hub');assert.equal(opened[0].kind,'popup');assert.equal(opened[0].props.popup,true);
assert.equal(calls.length,0,'opening the switcher does not reveal or resize the sidebar');
const hub=new Hub();hub.roots={project:'/repo'};hub.stacks={};hub.popupHandle={};
hub.taskCache={'[null,"/repo"]':{tasks:[{title:'Implement feature',agent:'t1',state:'doing'}]}};
reset();currentProps={popup:true,overlay:'switcher'};hub.render({});
const popupLabels=labels.filter(label=>label!=='×'&&!label.startsWith('↑↓ move'));
const actions=new Map(nodes.filter(n=>n.id&&n.click).map(n=>[n.id,n.click]));
reset();currentProps={};hub.render({});assert.deepEqual(labels,popupLabels,'sidebar and popup show the same project/agent/pane/task data');
currentProps={popup:true,overlay:'switcher'};reset();
actions.get('agent-t1')();
assert.deepEqual(calls,[{command:'space.select',args:{id:'project'}},{command:'tab.select',args:{id:'work'}},{command:'pane.focus',args:{pane:'agent-pane'}}]);
assert.deepEqual(closed,['switcher']);
reset();actions.get('pane-shell-pane')();
assert.equal(calls.at(-1).args.pane,'shell-pane');assert.deepEqual(closed,['switcher']);
reset();actions.get('fold-[null,"/repo"]')();
assert.equal(closed.length,0);assert.equal(calls.length,0,'folding does not navigate or close the popup');
reset();actions.get('board-[null,"/repo"]')();
assert.deepEqual(closed,['switcher']);assert.equal(opened[0].props.board,true);
currentProps={overlay:'project-hub'};reset();assert.equal(hub.isPopup(),true);hub.focusDestination('project','work','shell-pane');assert.deepEqual(closed,['project-hub'],'mod.open shortcut dismisses after navigation');
currentProps={board:true,overlay:'board'};assert.equal(hub.isPopup(),false,'task board is not a switcher');
currentProps={};reset();hub.focusDestination('project','work','shell-pane');assert.equal(closed.length,0,'sidebar navigation remains open');
// Tree keyboard navigation selects visible items without changing the active project.
currentProps={overlay:'project-hub'};state={};hub.popupRows=[];hub.popupSelected=null;hub.popupScroll=0;reset();hub.render({});
const projectId='project:[null,"/repo"]',roleId='tab-kind:[null,"/repo"]:Planner';
let notifications=0,stops=0;const cx={notify(){notifications++;},stop_propagation(){stops++;}};
function press(key){hub.popupKey({key,modifiers:{}},cx);reset();hub.render({});}
assert.equal(hub.popupSelected,projectId);
press('right');assert.equal(hub.popupSelected,roleId);
press('right');assert.equal(hub.popupSelected,'agent:t1');
press('left');assert.equal(hub.popupSelected,roleId);
press('left');assert.equal(hub.folded(roleId),true);assert.ok(!hub.popupRows.some(row=>row.id==='agent:t1'));
press('right');assert.equal(hub.folded(roleId),false);
press('right');assert.equal(hub.popupSelected,'agent:t1');
assert.equal(calls.length,0,'arrow navigation does not switch projects or panes');
hub.popupKey({key:'enter',modifiers:{}},cx);assert.equal(calls.at(-1).args.pane,'agent-pane');assert.deepEqual(closed,['project-hub']);
reset();hub.popupKey({key:'escape',modifiers:{}},cx);assert.deepEqual(closed,['project-hub']);
// End and Home scroll the highlight into view in a long list; disappearing items cannot remain selected.
spaceList=[space,...Array.from({length:40},(_,i)=>({id:'other-'+i,folder:'/repo-'+i,machine:null,tabs:[],active:false}))];
hub.popupSelected=projectId;reset();hub.render({});press('end');
assert.equal(hub.popupSelected,'project:[null,"/repo-39"]');assert.ok(hub.popupScroll>0);
const removed=hub.popupSelected;spaceList.pop();reset();hub.render({});assert.notEqual(hub.popupSelected,removed);
press('home');assert.equal(hub.popupSelected,projectId);assert.equal(hub.popupScroll,0);
const selectedBefore=hub.popupSelected;hub.popupKey({key:'down',modifiers:{platform:true}},cx);assert.equal(hub.popupSelected,selectedBefore);
spaceList=[space];
assert.ok(notifications>0&&stops>0);
console.log('Project switcher checks passed: shared content, exact pane focus, keyboard tree navigation, collapse/expand, long-list scrolling and removed-item recovery');
