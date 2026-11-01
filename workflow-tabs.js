// Shared source embedded into both mods. This file has no top-level side effects.
const WORKFLOW_NVIM_CLIENT = `import json, subprocess, sys, time
socket, request = sys.argv[1], json.loads(sys.argv[2])
def call(expr):
    return subprocess.run(['nvim','--server',socket,'--remote-expr',expr],capture_output=True,text=True,timeout=3)
try:
    deadline=time.monotonic()+8
    while True:
        probe=call('1')
        if probe.returncode==0: break
        if time.monotonic()>=deadline:
            print(json.dumps({'ok':False,'kind':'unavailable','message':'Neovim is not listening on its project socket'}));sys.exit(0)
        time.sleep(0.1)
    if not request.get('file'):
        print(json.dumps({'ok':True}));sys.exit(0)
    lua="(function() local p=_A; local b=vim.fn.bufnr(p.file); if b>=1 then vim.cmd('hide buffer '..b) else vim.cmd('hide edit '..vim.fn.fnameescape(p.file)) end; if p.line and p.line>0 then vim.api.nvim_win_set_cursor(0,{math.min(p.line,vim.api.nvim_buf_line_count(0)),0}) end; return vim.api.nvim_buf_get_name(0) end)()"
    def quote(value): return "'"+value.replace("'","''")+"'"
    expr='luaeval('+quote(lua)+',json_decode('+quote(json.dumps(request))+'))'
    result=call(expr)
    print(json.dumps({'ok':result.returncode==0,'kind':'edit','message':result.stderr.strip(),'file':result.stdout.strip()}))
except Exception as error:
    print(json.dumps({'ok':False,'kind':'error','message':str(error)}))
`;
function workflowKey(options) {return JSON.stringify([options.on||null,options.root]);}
function workflowRead(key) {return (shared('project.workflow.tabs')||{})[key]||{};}
function workflowPatch(key,patch) {
  const all=shared('project.workflow.tabs')||{};
  setShared('project.workflow.tabs',{...all,[key]:{...(all[key]||{}),...patch}});
}
function workflowLock(key,kind,acquire) {
  const locks=shared('project.workflow.locks')||{},id=JSON.stringify([key,kind]);
  if(acquire&&locks[id]&&Date.now()-locks[id]<90000)return false;
  setShared('project.workflow.locks',{...locks,[id]:acquire?Date.now():0});return true;
}
async function workflowCommand(name,args) {
  const result=await exec('herdr-app',['do',name,JSON.stringify(args)]);
  let value;try{value=JSON.parse(result.stdout);}catch(_){value={};}
  if(result.code!==0||value.error)throw new Error(value.error||result.stderr||`Could not ${name}`);
  return value;
}
function workflowFindTab(record) {
  if(!record?.tab)return null;
  const space=spaces().find(s=>s.tabs.some(tab=>tab.id===record.tab));
  if(!space)return null;
  const pane=panes().find(p=>p.tab===record.tab && (!record.terminal||p.terminal===record.terminal));
  return pane?{...record,space:space.id,pane:pane.pane,terminal:pane.terminal||record.terminal}:null;
}
function workflowFocus(record) {
  run('space.select',{id:record.space});run('tab.select',{id:record.tab});
  if(record.pane)run('pane.focus',{pane:record.pane});
}
async function workflowDiff(options) {
  const key=workflowKey(options);
  if(!workflowLock(key,'diff',true))return null;
  try {
    let existing=workflowFindTab(workflowRead(key).diff);
    if(!existing) {
      const allowed=new Set(options.spaceIds||[options.space]);
      const projectSpaces=spaces().filter(s=>allowed.has(s.id)&&(s.machine||null)===(options.on||null));
      const tabs=new Map(projectSpaces.flatMap(space=>space.tabs.map(tab=>[tab.id,space.id])));
      const pane=panes().find(p=>p.mod==='project-diff'&&tabs.has(p.tab));
      if(pane)existing={space:tabs.get(pane.tab),tab:pane.tab,pane:pane.pane};
    }
    if(existing){workflowPatch(key,{diff:existing});workflowFocus(existing);return existing;}
    const created=await workflowCommand('tab.new',{space:options.space,name:'Diff',mod:'project-diff',props:{cwd:options.root,on:options.on||null}});
    const record={...created,space:created.space||options.space};workflowPatch(key,{diff:record});return record;
  }catch(error){notify({title:'Could not open Diff',body:String(error),level:'error'});return null;}
  finally{workflowLock(key,'diff',false);}
}
function workflowShellQuote(text) {return "'"+String(text).replace(/'/g,"'\\''")+"'";}
async function workflowSocket(options) {
  const r=await exec('mktemp',['-d','/tmp/herdr-nvim.XXXXXXXX'],{on:options.on});
  if(r.code!==0||!r.stdout.trim())throw new Error(r.stderr||'Could not create editor socket directory');
  return r.stdout.trim()+'/nvim.sock';
}
async function workflowNvim(record,request,options) {
  const r=await exec('python3',['-c',WORKFLOW_NVIM_CLIENT,record.socket,JSON.stringify(request)],{cwd:options.root,on:options.on});
  if(r.code!==0)throw new Error(r.stderr||'Could not contact Neovim');
  return JSON.parse(r.stdout);
}
async function workflowEditor(options) {
  const key=workflowKey(options),request={id:`${Date.now()}-${Math.random()}`,file:options.file||null,line:options.line||null};
  workflowPatch(key,{editorRequest:request});
  if(!workflowLock(key,'editor',true))return null;
  try {
    let record=workflowFindTab(workflowRead(key).editor);
    let handled=null;
    for(;;) {
      const latest=workflowRead(key).editorRequest;
      if(!latest||latest.id===handled)break;
      if(latest.file) {
        const exists=await exec('test',['-f',latest.file],{on:options.on});
        if(exists.code!==0)throw new Error('This file is not present in the working tree. Neovim opens working-tree files, not historical commit snapshots.');
      }
      if(!record) {
        const socket=await workflowSocket(options);
        const created=await workflowCommand('tab.new',{space:options.space,name:'Editor',folder:options.root,argv:['nvim','--listen',socket,'--',latest.file||options.root]});
        record={...created,space:created.space||options.space,socket};
        workflowPatch(key,{editor:record});
      }
      let result=await workflowNvim(record,latest,options);
      if(!result.ok && result.kind==='unavailable') {
        const core=await hc(['get',record.terminal,'--json']);
        const info=core.code===0?JSON.parse(core.stdout):null;
        const fg=info?.foreground,program=String(fg?.argv?.[0]||fg?.name||'').split(/[\\/]/).pop().replace(/^-/,'');
        if(!['sh','bash','zsh','fish','dash','ksh'].includes(program))throw new Error('The Editor tab is open but its Neovim server is unavailable. Close that tab to start a fresh editor.');
        const socket=await workflowSocket(options);
        const command='cd '+workflowShellQuote(options.root)+' && '+['nvim','--listen',socket,'--',latest.file||options.root].map(workflowShellQuote).join(' ');
        const sent=await hc(['send',record.terminal,command,'--json']);
        if(sent.code!==0)throw new Error(sent.stderr||'Could not restart Neovim in the Editor tab');
        record={...record,socket};workflowPatch(key,{editor:record});result=await workflowNvim(record,latest,options);
      }
      if(!result.ok)throw new Error(result.message||'Neovim could not open the file');
      handled=latest.id;
    }
    if(record)workflowFocus(record);
    return record;
  }catch(error){notify({title:'Could not open Editor',body:String(error),level:'error'});return null;}
  finally{workflowLock(key,'editor',false);}
}
