const fs=require('fs'),assert=require('assert/strict');
const counts={spaces:0,agents:0,panes:0,terminals:0,shared:0};
const owners=Array.from({length:30},(_,i)=>({address:`t${i}`,space:'s',tab:'tab',tab_name:'Implementer',title:'',status:'working',program:{agent:true}}));
const paneList=owners.map(a=>({pane:`p-${a.address}`,terminal:a.address,tab:'tab',program:a.program}));
const spaceList=[{id:'s',active:true,folder:'/repo',machine:null,tabs:[{id:'tab',name:'Work'}]}];
const core=Array.from({length:500},(_,i)=>({address:`background-${i}`,state:'live',foreground:{name:'zsh',argv:['zsh']}}));
let nodes=0;const text=[];
function element(){nodes++;let proxy;proxy=new Proxy({}, {get:(_t,key)=>{
 if(key==='when')return (condition,fn)=>condition?fn(proxy):proxy;
 if(key==='child')return value=>{if(typeof value==='string')text.push(value);return proxy;};
 return ()=>proxy;
}});return proxy;}
const env={View:class{},div:element,svg:element,image:element,h_flex:element,v_flex:element,
 spaces:()=>{counts.spaces++;return spaceList;},agents:()=>{counts.agents++;return owners;},
 panes:()=>{counts.panes++;return paneList;},terminals:()=>{counts.terminals++;return core;},
 shared:()=>{counts.shared++;return {};},props:()=>({board:true}),theme:()=>({}),run:()=>{}};
const source=fs.readFileSync(`${__dirname}/project-hub/main.js`,'utf8').replace(/^import .*;\n/gm,'').replace('export default class ProjectHub','class ProjectHub');
const Hub=new Function('env',`const {${Object.keys(env).join(',')}}=env;${source};return ProjectHub;`)(env);
const hub=new Hub();hub.roots={s:'/repo'};hub.tasks=Array.from({length:1000},(_,i)=>({index:i,title:`Task ${i}`,agent:`t${i%30}`,state:['todo','doing','review','done'][i%4]}));
hub.board({},{});
for(const key of ['spaces','agents','panes','terminals'])assert.equal(counts[key],1,`${key} must be snapshotted once per board render`);
assert.ok(nodes<2000,`Board rendering must be bounded, got ${nodes} elements`);
assert.ok(text.some(t=>t.includes('Task 0')));
for(const key of Object.keys(counts))counts[key]=0;
nodes=0;text.length=0;hub.boardPages={todo:1};hub.board({},{});
for(const key of ['spaces','agents','panes','terminals'])assert.equal(counts[key],1);
assert.ok(text.includes('Task 80'));
assert.ok(!text.includes('Task 0'));
assert.ok(text.includes('21–40 / 250'));
console.log(`Large board check passed: 1,000 tasks, ${nodes} elements, one snapshot per data source`);
