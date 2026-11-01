const assert=require('assert/strict'),fs=require('fs');
let currentProps={},roles={},calls=[],closed=[];
const source=fs.readFileSync(`${__dirname}/project-agent-launch/main.js`,'utf8').replace(/^import .*;\n/gm,'').replace('export default class AgentLaunch','class AgentLaunch');
const env={View:class{},props:()=>currentProps,shared:()=>roles,setShared:(_key,value)=>{roles=value;},closeOverlay:id=>closed.push(id),
 exec:async(command,args)=>{calls.push({command,args});return {code:0,stdout:JSON.stringify({space:'s',tab:'tab-new',pane:'p-new',terminal:'t-new'})};}};
const {AgentLaunch,agentTabName,agentLaunchArgs}=new Function('env',`const {${Object.keys(env).join(',')}}=env;${source};return {AgentLaunch,agentTabName,agentLaunchArgs};`)(env);
assert.equal(agentTabName('PROJECT-42','Planner','Claude Code'),'PROJECT-42 Planner');
assert.equal(agentTabName('PROJECT-42 planner','Planner','Claude Code'),'PROJECT-42 planner');
assert.equal(agentTabName('Planner PROJECT-42','Planner','Claude Code'),'Planner PROJECT-42');
assert.equal(agentTabName('Replanner','Planner','Claude Code'),'Replanner Planner');
assert.equal(agentTabName('PROJECT-42 Implementor','Implementer','Claude Code'),'PROJECT-42 Implementor');
assert.equal(agentTabName('PROJECT-42 Implmentor','Implementer','Claude Code'),'PROJECT-42 Implmentor');
assert.equal(agentTabName('Review API','Reviewer','Claude Code'),'Review API');
assert.equal(agentTabName('API','Reviewer','Claude Code'),'API Reviewer');
assert.equal(agentTabName('','Planner','Codex'),'Codex Planner');
assert.equal(agentTabName('API Researcher','Researcher','Codex'),'API Researcher');
assert.equal(agentTabName('API','QA (Security)','Codex'),'API QA (Security)');
assert.equal(agentTabName('API QA (Security)','QA (Security)','Codex'),'API QA (Security)');
assert.deepEqual(agentLaunchArgs({key:'codex',run:['codex','--no-daemon']}),['codex','--no-daemon']);
assert.deepEqual(agentLaunchArgs({key:'codex',run:['codex']}),['codex','--no-daemon']);
(async()=>{
 currentProps={overlay:'o',space:'s',folder:'/repo',agent:{key:'codex',name:'Codex',run:['codex']}};
 const launcher=new AgentLaunch();launcher.role='Other';launcher.custom='Researcher';launcher.name='API';
 await launcher.createAgent();
 const request=JSON.parse(calls[0].args[2]);assert.equal(request.name,'API Researcher');assert.equal(request.space,'s');assert.deepEqual(request.argv,['codex','--no-daemon']);
 assert.equal(roles['t-new'],'Researcher');assert.match(request.task,/Wait for the user's task/);
 launcher.custom='';await assert.rejects(launcher.createAgent());assert.equal(calls.length,1);
 console.log('Agent launch checks passed: names, suffix deduplication, custom roles, argv and role persistence');
})().catch(e=>{console.error(e);process.exitCode=1;});
