const fs=require('fs'),assert=require('assert/strict');
const source=fs.readFileSync(`${__dirname}/project-agent-launch/main.js`,'utf8').replace(/^import .*;\n/gm,'').replace('export default class AgentLaunch','class AgentLaunch');
const agents=[{key:'claude',name:'Claude Code',run:['claude'],installed:true},{key:'codex',name:'Codex',run:['codex'],installed:true},{key:'opencode',name:'OpenCode',run:['opencode'],installed:true}];
let calls=[],spaceList=[],roles={},closed=[],failReviewer=false,sequence=0,successes=[];
const properties={worktree:true,space:'source-space',folder:'/repo',on:null,overlay:'launcher'};
function input(){let value='';return {value:()=>value,set_value:next=>{value=next;},on(){},focus(){}};}
const jobs=[],cx={focus_handle:()=>({focus(){}}),notify(){},spawn(fn){jobs.push(fn(this));}};
async function drain(){while(jobs.length)await jobs.shift();}
const env={View:class{},InputState:{new:input},props:()=>properties,spaces:()=>spaceList,knownAgents:async()=>agents,
 appHome:()=>'/config',readTextFile:async()=> 'helper',shared:()=>roles,setShared:(_key,value)=>{roles=value;},closeOverlay:id=>closed.push(id),notify(){},
 exec:async(command,args,options)=>{
  calls.push({command,args,options});
  if(command==='git')return {code:args[0]==='show-ref'?1:0,stdout:'/repo'};
  if(command==='wt')return {code:0,stdout:args[0]==='switch'?'{}\n{"herdr_worktree_cwd":"/repo.orders"}\n':'wt v0.77.0'};
  if(command==='python3'){const request=JSON.parse(args[2]);return {code:0,stdout:JSON.stringify({ok:true,native:true,argv:[...request.argv,'--test-session-name',request.name]})};}
  if(command==='herdr-app'){
   const request=JSON.parse(args[2]);
   if(failReviewer&&(request.tab||request.name).endsWith('Reviewer'))return {code:1,stdout:'',stderr:'Reviewer launch failed'};
   const id=++sequence,space=args[1]==='space.new'?'worktree-space':request.space;
   if(!spaceList.some(s=>s.id===space))spaceList.push({id:space,machine:null,folder:request.folder,tabs:[]});
   const result={space,tab:'tab-'+id,terminal:'t'+id};spaceList.find(s=>s.id===space).tabs.push({id:result.tab});
   successes.push({request,result});return {code:0,stdout:JSON.stringify(result)};
  }
  throw Error(command);
 }};
const {Launcher,companionName}=new Function('env',`const {${Object.keys(env).join(',')}}=env;${source};return {Launcher:AgentLaunch,companionName};`)(env);
assert.equal(companionName('Orders Planner','Planner','Implementer','Orders'),'Orders Implementer');
assert.equal(companionName('Planner Orders','Planner','Reviewer','Orders'),'Orders Reviewer');
assert.equal(companionName('Orders QA (Security)','QA (Security)','Reviewer','Orders'),'Orders Reviewer');
(async()=>{
 const view=new Launcher();view.init({},cx);await drain();
 view.agent=agents[0];view.role='Planner';view.worktreeName='orders';view.name='Orders Planner';
 view.launch(cx);assert.equal(view.teamSetup,true);assert.equal(calls.length,0,'asking about companions must not start worktrees or agents');
 assert.deepEqual(view.companionRoles(),['Implementer','Reviewer','None']);assert.deepEqual(view.companionPlans(),[],'additional roles are opt-in');
 view.extraRoles={Implementer:true,Reviewer:true};view.extraAgents={Implementer:agents[1],Reviewer:agents[2]};view.extraNames={Reviewer:'Orders audit'};
 const plans=view.companionPlans();assert.equal(plans[0].name,'Orders Implementer');assert.equal(plans[1].name,'Orders audit Reviewer');
 failReviewer=true;await assert.rejects(view.createTeam(cx,plans),/Reviewer launch failed/);
 assert.equal(successes.length,2);assert.equal(successes[0].request.tab,'Orders Planner');assert.equal(successes[1].request.name,'Orders Implementer');
 assert.equal(successes[1].request.space,'worktree-space');
 failReviewer=false;await view.createTeam(cx,plans);
 assert.equal(successes.length,3,'retry starts only the missing role');
 assert.equal(calls.filter(c=>c.command==='wt'&&c.args[0]==='switch').length,1,'the team shares one prepared worktree');
 assert.deepEqual(Object.values(roles),['Planner','Implementer','Reviewer']);
 for(const {request} of successes){
  const name=request.tab||request.name;
  assert.equal(request.argv.at(-1),name,'native session name must equal tab name');
  assert.equal(request.folder,'/repo.orders');assert.match(request.task,/Wait for the user's task/);
 }
 // Confirming only the primary role never creates any companion.
 calls=[];spaceList=[];successes=[];roles={};const only=new Launcher();only.init({},cx);await drain();
 only.agent=agents[0];only.role='Reviewer';only.worktreeName='orders';
 only.startLaunch(cx,[]);await drain();assert.equal(successes.length,1);assert.equal(closed.at(-1),'launcher');
 assert.deepEqual(only.companionRoles(),['Planner','Implementer','None']);
 only.role='Other';only.custom='Architect';assert.deepEqual(only.companionRoles(),['Planner','Implementer','Reviewer','None']);
 // Every primary role permits every subset of its remaining role options, including none.
 let combinations=0;
 for(const primaryRole of ['Planner','Implementer','Reviewer','None']) {
  const available=['Planner','Implementer','Reviewer','None'].filter(role=>role!==primaryRole);
  for(let mask=0;mask<(1<<available.length);mask++) {
   calls=[];spaceList=[];successes=[];roles={};
   const option=new Launcher();option.init({},cx);await drain();option.agent=agents[0];option.role=primaryRole;option.worktreeName='orders';option.name='Orders';
   option.extraRoles=Object.fromEntries(available.map((role,index)=>[role,Boolean(mask&(1<<index))]));
   const extras=option.companionPlans();await option.createTeam(cx,extras);
   assert.equal(successes.length,1+extras.length);
   const expected=[primaryRole==='None'?'Unassigned':primaryRole,...available.filter((_role,index)=>mask&(1<<index)).map(role=>role==='None'?'Unassigned':role)];
   assert.deepEqual(Object.values(roles),expected,'only the selected roles may start');
   for(const {request,result} of successes){
    if(roles[result.terminal]==='Unassigned'){
     assert.equal(request.tab||request.name,'Orders');assert.match(request.task,/No project role is assigned/);
    }
   }
   combinations++;
  }
 }
 assert.equal(combinations,32);
 console.log('Team launch checks passed: opt-in prompt, missing-role suggestions, 32 role combinations, explicit unassigned agents, per-role names, one worktree and retry without duplicates');
})().catch(error=>{console.error(error);process.exitCode=1;});
