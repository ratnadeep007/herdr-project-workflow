const fs=require('fs'),assert=require('assert/strict'),path=require('path'),os=require('os'),cp=require('child_process');
const source=fs.readFileSync(`${__dirname}/project-agent-launch/main.js`,'utf8').replace(/^import .*;\n/gm,'').replace('export default class AgentLaunch','class AgentLaunch');
let properties={},calls=[],roles={},spaceList=[],failAgent=false,mode='mock',wtFailure=false,existingBranch=false;
let isolatedEnv;let labels=[];
function element(){let proxy;proxy=new Proxy({}, {get:(_target,key)=>{
 if(key==='when')return (condition,fn)=>condition?fn(proxy):proxy;
 if(key==='child')return value=>{if(typeof value==='string')labels.push(value);return proxy;};
 return ()=>proxy;
}});return proxy;}
const agent={key:'codex',name:'Codex',run:['codex']};
const env={View:class{},appHome:()=>'/config',readTextFile:async()=> 'helper',div:element,h_flex:element,v_flex:element,svg:element,image:element,Input:{new:element},theme:()=>({}),props:()=>properties,spaces:()=>spaceList,shared:()=>roles,setShared:(_key,value)=>{roles=value;},
 exec:async(command,args,options)=>{
  calls.push({command,args,options});
  if(command==='python3'){const p=JSON.parse(args[2]);return {code:0,stdout:JSON.stringify({ok:true,native:true,argv:[...p.argv,'--test-name',p.name]})};}
  if(command==='herdr-app'){
   if(failAgent)return {code:1,stdout:'',stderr:'Launch failed'};
   const request=JSON.parse(args[2]);
   if(args[1]==='space.new')spaceList.push({id:'new-space',machine:request.machine,folder:request.folder,tabs:[{id:'new-tab'}]});
   return {code:0,stdout:JSON.stringify({space:'new-space',tab:'new-tab',terminal:'new-agent'})};
  }
  if(mode==='mock'){
   if(command==='git'&&args[0]==='show-ref')return {code:existingBranch?0:1,stdout:'',stderr:''};
   if(command==='wt'&&args[0]==='switch')return wtFailure?{code:1,stdout:'',stderr:'Hooks require approval'}:
    {code:0,stdout:'{"action":"created","path":"/worktree/new"}\n{"herdr_worktree_cwd":"/worktree/new"}\n',stderr:''};
   return {code:0,stdout:command==='wt'?'wt v0.77.0':'/repo',stderr:''};
  }
  const result=cp.spawnSync(command,args,{cwd:options.cwd,env:isolatedEnv,encoding:'utf8',timeout:20000});
  return {code:result.status,stdout:result.stdout||'',stderr:result.stderr||result.error?.message||''};
 }};
const {Launcher,worktreeInputs,worktreeResult}=new Function('env',`const {${Object.keys(env).join(',')}}=env;${source};return {Launcher:AgentLaunch,worktreeInputs,worktreeResult};`)(env);
function launcher(name,branch=''){
 const view=new Launcher();Object.assign(view,{role:'Other',custom:'Researcher',name:'',agent,worktreeName:name,branch});return view;
}
function request(){return JSON.parse(calls.filter(c=>c.command==='herdr-app').at(-1).args[2]);}
function switches(){return calls.filter(c=>c.command==='wt'&&c.args[0]==='switch');}
assert.deepEqual(worktreeInputs(' feature-auth ',' '),{name:'feature-auth',branch:'feature-auth'});
assert.deepEqual(worktreeInputs('Auth work','feature/auth'),{name:'Auth work',branch:'feature/auth'});
assert.throws(()=>worktreeInputs('','branch'));assert.throws(()=>worktreeInputs('bad\nname','branch'));
assert.throws(()=>worktreeResult('{"path":"/unconfirmed"}'));
(async()=>{
 properties={space:'original',folder:'/repo',on:'remote',worktree:true};
 let view=launcher('feature-auth');await view.createAgent();
 assert.equal(request().folder,'/worktree/new');assert.equal(request().machine,'remote');
 assert.equal(request().name,'feature-auth');assert.equal(request().tab,'feature-auth Researcher');
 assert.deepEqual(request().argv,['codex','--no-daemon','--test-name','feature-auth Researcher']);assert.match(request().task,/Your project role is Researcher/);
 assert.equal(roles['new-agent'],'Researcher');
 assert.deepEqual(switches()[0].args.slice(0,3),['switch','--create','feature-auth']);
 assert.equal(switches()[0].options.on,'remote');
 for(const flag of ['--yes','--no-hooks','--clobber'])assert.ok(!switches()[0].args.includes(flag));
 // A failed agent launch leaves the prepared worktree reusable, without running wt again.
 calls=[];spaceList=[];failAgent=true;view=launcher('Auth work','feature/auth');
 await assert.rejects(view.createAgent(),/Launch failed/);assert.equal(switches().length,1);
 failAgent=false;await view.createAgent();assert.equal(switches().length,1);
 assert.equal(request().name,'Auth work');assert.equal(request().tab,'Auth work Researcher');
 // Existing branches use wt switch without --create; an existing GUI space gets a tab.
 calls=[];existingBranch=true;view=launcher('Auth work','feature/auth');await view.createAgent();
 assert.ok(!switches()[0].args.includes('--create'));
 assert.equal(calls.filter(c=>c.command==='herdr-app').at(-1).args[1],'tab.new');
 assert.equal(request().space,'new-space');
 calls=[];wtFailure=true;await assert.rejects(launcher('blocked').createAgent(),/Hooks require approval/);
 assert.equal(calls.filter(c=>c.command==='herdr-app').length,0,'do not start an agent if wt fails');
 wtFailure=false;
 // None opens the native configured shell: no argv, task, role requirement or role write.
 calls=[];spaceList=[];const rolesBefore=JSON.stringify(roles);view=launcher('shell-work');
 view.shellOnly=true;view.custom='';view.agents=[];
 await view.createAgent();
 assert.equal(request().tab,'Shell');assert.equal(request().folder,'/worktree/new');
 assert.ok(!Object.hasOwn(request(),'argv'));assert.ok(!Object.hasOwn(request(),'task'));
 assert.equal(JSON.stringify(roles),rolesBefore);
 labels=[];view.render();assert.ok(labels.includes('None'));assert.ok(labels.includes('Shell only'));
 assert.ok(!labels.includes('Mode'));assert.ok(!labels.includes('Planner'));
 assert.ok(labels.includes('Create / switch & open shell'));
 view.shellOnly=false;view.agents=[{...agent,installed:true,icon:'icons/codex.svg',tint:true},{key:'missing',name:'Missing agent',installed:false,icon:'icons/agent.svg',tint:true}];labels=[];view.render();assert.ok(labels.includes('Mode'),'agent selection restores modes');assert.ok(labels.includes('Codex'));assert.ok(labels.includes('Not installed'));
 console.log('Worktree launch checks passed: branch defaults/overrides, switched cwd, remote routing, roles, hook failures, retry reuse and shell-only requests/UI');

 if(cp.spawnSync('wt',['--version'],{encoding:'utf8'}).status!==0){
  console.log('Real Worktrunk check skipped: wt is not installed');return;
 }
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'herdr-wt-test-')),repo=path.join(temporary,'repo');fs.mkdirSync(repo);
 isolatedEnv={...process.env,WORKTRUNK_CONFIG_PATH:path.join(temporary,'wt.toml'),WORKTRUNK_SYSTEM_CONFIG_PATH:path.join(temporary,'system.toml'),
  XDG_CACHE_HOME:path.join(temporary,'cache'),XDG_STATE_HOME:path.join(temporary,'state'),XDG_DATA_HOME:path.join(temporary,'data')};
 fs.writeFileSync(isolatedEnv.WORKTRUNK_CONFIG_PATH,'skip-shell-integration-prompt = true\n');
 const git=(cwd,...args)=>cp.execFileSync('git',args,{cwd,env:isolatedEnv,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 try{
  git(repo,'init','-b','main');git(repo,'-c','user.name=Test','-c','user.email=test@example.invalid','commit','--allow-empty','-m','Initial');
  mode='real';calls=[];spaceList=[];properties={space:'original',folder:repo,on:null,worktree:true};
  view=launcher('feature-auth');await view.createAgent();
  const first=request().folder;assert.equal(git(first,'branch','--show-current'),'feature-auth');
  assert.equal(fs.realpathSync(first),fs.realpathSync(repo+'.feature-auth'));
  view=launcher('Custom label','feature/custom');await view.createAgent();
  assert.equal(git(request().folder,'branch','--show-current'),'feature/custom');assert.equal(request().name,'Custom label');
  view=launcher('shell-only');view.shellOnly=true;view.custom='';await view.createAgent();
  assert.equal(git(request().folder,'branch','--show-current'),'shell-only');
  assert.equal(request().tab,'Shell');assert.ok(!Object.hasOwn(request(),'argv'));assert.ok(!Object.hasOwn(request(),'task'));
  // Git validates the branch before invoking wt or creating a GUI agent.
  calls=[];await assert.rejects(launcher('bad branch').createAgent(),/Invalid branch name/);
  assert.equal(switches().length,0);assert.equal(calls.filter(c=>c.command==='herdr-app').length,0);
  properties={space:'original',folder:temporary,on:null,worktree:true};
  await assert.rejects(launcher('outside-repo').createAgent(),/Open a Git project/);
  console.log('Real Worktrunk checks passed: worktrees/branches created, switch cwd confirmed, custom branch and invalid input; no real agents started');
 }finally{fs.rmSync(temporary,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
