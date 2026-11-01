const assert=require('assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
const source=fs.readFileSync(`${__dirname}/workflow-tabs.js`,'utf8');
for(const mod of ['project-hub','project-diff'])assert.ok(fs.readFileSync(`${__dirname}/${mod}/main.js`,'utf8').includes('// WORKFLOW_TABS_BEGIN\n'+source+'// WORKFLOW_TABS_END'),`${mod} must embed the current shared tab helper`);
const load=env=>new Function('env',`const {${Object.keys(env).join(',')}}=env;${source};return {workflowDiff,workflowEditor,workflowShellQuote,WORKFLOW_NVIM_CLIENT};`)(env);
let state={},spaceList=[{id:'s',machine:null,tabs:[]}],paneList=[],created=0,sends=[],edits=[],nextTerminal=0,notices=[];
const env={shared:k=>state[k],setShared:(k,v)=>{state[k]=v;},spaces:()=>spaceList,panes:()=>paneList,run:()=>{},notify:v=>notices.push(v),
 hc:async args=>{sends.push(args);return {code:0,stdout:JSON.stringify({foreground:{argv:['zsh']}})};},
 exec:async(command,args)=>{
  if(command==='herdr-app'){
   created++;const options=JSON.parse(args[2]),tab=`tab-${created}`,pane=`pane-${created}`,terminal=options.argv?`terminal-${++nextTerminal}`:null;
   spaceList[0].tabs.push({id:tab,name:options.name});paneList.push({pane,tab,terminal,mod:options.mod});
   return {code:0,stdout:JSON.stringify({space:'s',tab,pane,terminal})};
  }
  if(command==='mktemp')return {code:0,stdout:'/tmp/test-editor-dir\n'};
  if(command==='test')return {code:0};
  if(command==='python3'){
   const request=JSON.parse(args[3]);edits.push(request);
   await Promise.resolve();return {code:0,stdout:JSON.stringify({ok:true,file:request.file})};
  }
  throw Error(command);
 }};
const api=load(env),options={space:'s',spaceIds:['s'],root:'/repo',on:null};
(async()=>{
 await Promise.all([api.workflowDiff(options),api.workflowDiff(options),api.workflowDiff(options)]);
 assert.equal(created,1,'rapid Diff clicks must create one tab');
 await api.workflowDiff(options);assert.equal(created,1,'existing Diff must be reused');
 await Promise.all([api.workflowEditor({...options,file:'/repo/first.txt'}),api.workflowEditor({...options,file:'/repo/second.txt'})]);
 assert.equal(created,2,'rapid Editor requests must create one editor tab');
 assert.equal(edits.at(-1).file,'/repo/second.txt','latest file request must reach existing editor');
 const editor=Object.values(state['project.workflow.tabs'])[0].editor;
 await api.workflowEditor({...options,file:'/repo/third.txt'});assert.equal(created,2);assert.equal(Object.values(state['project.workflow.tabs'])[0].editor.terminal,editor.terminal);
 assert.equal(sends.length,0,'reuse must use Neovim RPC, not terminal keystrokes');assert.equal(notices.length,0);
 assert.equal(api.workflowShellQuote("a'b"),"'a'\\''b'");
 // Discover an already-open Diff when shared bookkeeping is absent.
 delete state['project.workflow.tabs'];await api.workflowDiff(options);assert.equal(created,2);
 // A closed editor may be recreated, while an open one is reused.
 paneList=paneList.filter(p=>p.terminal!==editor.terminal);spaceList[0].tabs=spaceList[0].tabs.filter(t=>t.id!==editor.tab);
 await api.workflowEditor({...options,file:'/repo/fourth.txt'});assert.equal(created,3);
 console.log('Tab reuse checks passed: existing tabs, rapid clicks, queued file switches, closed editor recovery');

 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'herdr-nvim-test-')),socket=path.join(directory,'nvim.sock');
 const first=path.join(directory,"first 'quoted'.txt"),second=path.join(directory,'second | file.txt');
 fs.writeFileSync(first,'original\n');fs.writeFileSync(second,'one\ntwo\n');
 const nvim=cp.spawn('nvim',['--headless','--clean','-n','--listen',socket],{stdio:'ignore'});
 const vimQuote=s=>"'"+s.replace(/'/g,"''")+"'";
 const rpc=expr=>cp.execFileSync('nvim',['--server',socket,'--remote-expr',expr],{encoding:'utf8'}).trim();
 const open=request=>{
  const r=cp.spawnSync('python3',['-c',api.WORKFLOW_NVIM_CLIENT,socket,JSON.stringify(request)],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);const result=JSON.parse(r.stdout);assert.equal(result.ok,true,result.message);return result;
 };
 try{
  open({file:first});const pid=rpc('getpid()');
  rpc(`luaeval('vim.api.nvim_buf_set_lines(0,0,-1,false,{"unsaved edit"})')`);
  open({file:second,line:99});assert.equal(rpc('getpid()'),pid);assert.equal(rpc('line(".")'),'2');assert.equal(rpc('tabpagenr("$")'),'1');
  assert.equal(rpc(`getbufvar(bufnr(${vimQuote(first)}),'&modified')`),'1');
  open({file:first});assert.equal(rpc('getline(1)'),'unsaved edit');assert.equal(fs.readFileSync(first,'utf8'),'original\n');
  console.log('Neovim RPC checks passed: same process/tab, file switches, line navigation, quoted paths, unsaved buffers preserved');
 }finally{nvim.kill('SIGTERM');fs.rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
