// Behavior checks for mixed-pane classification and file-backed task ownership.
const fs = require('fs');
const assert = require('assert/strict');
let core = [], reported = [], paneList = [], spaceList = [];
const source = fs.readFileSync(`${__dirname}/project-hub/main.js`, 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export default class ProjectHub', 'class ProjectHub');
const Hub = new Function('View','terminals','agents','panes','spaces','shared', `${source}; return ProjectHub;`)(
  class {}, () => core, () => reported, () => paneList, () => spaceList, () => null);
const hub = new Hub();
const known = new Set(['t1']);
assert.equal(hub.paneKind({terminal:'t1',program:{shell:true}},known), 'Agents');
assert.equal(hub.paneKind({terminal:'t2',program:{agent:true}},known), 'Agents');
assert.equal(hub.paneKind({terminal:'t3',program:{shell:true}},known), 'Shells');
assert.equal(hub.paneKind({terminal:'t4',program:{shell:false}},known), 'Programs');
assert.equal(hub.paneKind({terminal:null,mod:'project-diff'},known), 'Panels');
assert.equal(hub.paneLabel({terminal:'shell',title:'PROJECT-42 Planner',cwd:'/repo/geo-caps',program:{name:'zsh',shell:true}}),'shell · zsh · geo-caps');
core = [{address:'wrapped',state:'live',foreground:{name:'claude',argv:['claude']}}];
assert.equal(hub.paneKind({terminal:'wrapped',program:{shell:true}},known),'Agents');
assert.equal(hub.foregroundAgent({foreground:{name:'node',argv:['node','/tools/codex.js']}}).key,'codex');
assert.equal(hub.foregroundAgent({foreground:{name:'codex',argv:['codex','app-server']}}),null);
assert.equal(hub.foregroundAgent({foreground:{name:'zsh',argv:['zsh']}}),null);
core = [{address:'editor',state:'live',foreground:{name:'nvim',argv:['nvim','.']}}];
assert.equal(hub.paneKind({terminal:'editor',program:{shell:true}},known),'Programs');
reported = [{address:'t1',space:'project',tab:'tab',program:{agent:true},status:'working'},
 {address:'hidden-child',space:'project',tab:'tab',program:{agent:true},status:'working'}];
core = [{address:'hidden-child',parent:'t1',state:'live',status:'working',program:{agent:true}}];
paneList=[{pane:'p1',terminal:'t1',tab:'tab',program:{agent:true}}];
assert.deepEqual(hub.allAgents().map(a=>a.address),['t1']);
paneList.push({pane:'p2',terminal:'hidden-child',tab:'tab',program:{agent:true}});
assert.deepEqual(hub.allAgents().map(a=>a.address),['t1','hidden-child']);
const cache={tasks:[{title:'T1 implement',agent:'t2',state:'doing'},
  {title:'T2 review',agent:'t2',state:'review'},{title:'Old task',agent:'t2',state:'done'},
  {title:'Another owner',agent:'t1',state:'doing'}]};
assert.equal(hub.taskLabel('t2',cache).list.length,2);
assert.match(hub.taskLabel('t2',cache).text,/T1 implement.*\(\+1\)/);
assert.equal(hub.taskLabel('t9',cache).text,'No active task assigned');
assert.equal(hub.taskLabel('t2',{error:true}).text,'Task list unavailable');
const fixtureSpaces=[{id:'project',tabs:[{id:'planner-tab',name:'Planner'},{id:'shell-tab',name:'Planner'}]}];
const fixturePanes=[{pane:'p1',terminal:'lead',tab:'planner-tab',program:{agent:true}},
  {pane:'p2',terminal:'shell-a',tab:'planner-tab',program:{shell:true}},
  {pane:'p3',terminal:'shell-b',tab:'planner-tab',program:{shell:true}},
  {pane:'p4',terminal:'another-shell',tab:'shell-tab',program:{shell:true}}];
const lead={address:'lead',tab:'planner-tab',tab_name:'Planner',title:''};
const groups=hub.tabGroups(fixtureSpaces,fixturePanes,[lead]);
assert.equal(groups.length,3);
assert.equal(groups[0].kind,'Planner');
assert.equal(groups[0].panes.length,1);
assert.equal(groups[0].extras.length,0);
assert.deepEqual(groups[1].extras.map(p=>p.terminal),['shell-a','shell-b']);
assert.equal(groups[1].kind,'Shells');
assert.equal(groups[1].panes.length,2);
assert.equal(groups[2].panes.length,1);
assert.equal(groups.flatMap(g=>g.agents).length,1);
const customGroups=hub.tabGroups(fixtureSpaces,fixturePanes,[lead],{roles:{lead:'Researcher'},terminalByAddress:new Map()});
assert.equal(customGroups[0].kind,'Researcher');
assert.equal(customGroups[0].agents[0].address,'lead');
console.log('Sidebar behavior checks passed');
