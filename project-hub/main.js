import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, agents, panes, theme, run, exec, props, shared, setShared, openOverlay, closeOverlay, readTextFile, writeTextFile, setAgentOrder, terminals, hc, notify } from "herdr";

// PROJECT_IDENTITY_BEGIN
// Stable identity shared by project surfaces. No top-level state or I/O.
function projectIdentityKey(root,on) {return JSON.stringify([on||null,root]);}
function projectName(root) {return String(root||"").split(/[\\/]/).filter(Boolean).pop()||"Project";}
function projectIdentity(root,on,saved=shared("project.identities")||{}) {
  const name=projectName(root),key=projectIdentityKey(root,on);
  let hash=2166136261;for(const char of key){hash^=char.codePointAt(0);hash=Math.imul(hash,16777619)>>>0;}
  const palette=["#e9b68b","#a8c7fa","#b6d7a8","#d4b5ec","#f0b4bf","#8ed2cf","#e5ce8b","#afc2e3","#c3d396","#cbb6ab","#c7baf2","#9dc9b7"];
  const words=name.replace(/([a-z])([A-Z])/g,"$1 $2").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const initials=(words.length>1?words[0][0]+words[1][0]:Array.from(words[0]||"P").slice(0,2).join("")).toUpperCase();
  return {key,name,initials,color:palette[hash%palette.length],...(saved[key]||{})};
}
function projectBadge(identity,size=24) {
  const tile=div().size(size).flex_none().rounded(6).overflow_hidden().bg(identity.color).text_color("#20252b").text_size(size<22?9:11).font_semibold().flex().items_center().justify_center();
  return tile.child(identity.image?image(identity.image).size(size):identity.emoji?div().text_size(size-6).child(identity.emoji):identity.initials);
}
// PROJECT_IDENTITY_END

// WORKFLOW_TABS_BEGIN
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
// WORKFLOW_TABS_END

const PROJECT_STACK_PROBE = `import json, os, sys
root=sys.argv[1];labels=[]
try:
    path=os.path.join(root,'package.json')
    package=json.load(open(path)) if os.path.isfile(path) and os.path.getsize(path)<1048576 else {}
    deps={**package.get('dependencies',{}),**package.get('devDependencies',{})}
    if 'react' in deps: labels.append('React')
    if 'vue' in deps: labels.append('Vue')
    if 'svelte' in deps: labels.append('Svelte')
    if package: labels.append('Node.js')
except (ValueError, OSError, TypeError): pass
for label,files in [('Python',['pyproject.toml','requirements.txt','setup.py','Pipfile']),('Rust',['Cargo.toml']),('Go',['go.mod']),('Docker',['Dockerfile','docker-compose.yml','compose.yml','compose.yaml'])]:
    if any(os.path.isfile(os.path.join(root,f)) for f in files): labels.append(label)
print(json.dumps(labels))
`;

const ROLES = ["Planner", "Implementer", "Reviewer"];
const STATES = ["todo", "doing", "review", "done"];
const TITLES = {todo:"Todo", doing:"In progress", review:"Review", done:"Done"};
function parse(text) {
  let fenced=false,current=null;
  const tasks=[];
  for(const [index,raw] of text.split("\n").entries()) {
    if(/^\s*(```|~~~)/.test(raw)){fenced=!fenced;continue;}
    if(fenced)continue;
    const m=/^((?:[-*+]|\d+[.)])\s+)\[([ xX])\]\s+(.*)$/.exec(raw);
    if(m) {
      const meta=/<!-- herdr:(.*?) -->/.exec(m[3]);
      let fields={};try{fields=meta?JSON.parse(meta[1]):{};}catch(_){}
      current={index,raw,prefix:m[1],title:m[3].replace(/<!-- herdr:.*? -->/,"").trim(),state:m[2].toLowerCase()==="x"?"done":STATES.includes(fields.state)&&fields.state!=="done"?fields.state:"todo",agent:fields.agent||null,subtasks:[]};
      tasks.push(current);continue;
    }
    const child=/^\s+(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s+(.*)$/.exec(raw);
    if(child&&current)current.subtasks.push({index,checked:child[1].toLowerCase()==="x",title:child[2].replace(/<!-- herdr:.*? -->/,"").trim()});
    else if(/^\S/.test(raw))current=null;
  }
  return tasks;
}

export default class ProjectHub extends View {
  init(_p, cx) {
    this.stacks = {}; this.roots = {}; this.taskCache = {}; this.tasks = []; this.text = null; this.error = null;
    this.refresh(cx);
    cx.timer.every(5000, cx => this.refresh(cx));
  }
  project(s) { return this.roots[s.id] || s.folder; }
  active() { return spaces().find(s=>s.active); }
  role(a, roles=shared("project.roles")||{}) {
    const explicit = roles[a.address];
    if (explicit) return explicit;
    const text = `${a.tab_name} ${a.title}`.toLowerCase();
    return /review/.test(text)?"Reviewer":/plan|orchestrat/.test(text)?"Planner":/impl/.test(text)?"Implementer":"Unassigned";
  }
  foregroundAgent(k) {
    const fg=k?.foreground;
    if(!fg)return null;
    const args=fg.argv||[],base=value=>String(value||"").split(/[\\/]/).pop().replace(/\.(?:js|mjs|cjs|exe)$/i,"");
    let name=base(fg.name||args[0]);
    if(["node","bun","deno"].includes(name))name=base(args[1]);
    if(name==="codex" && args.some(arg=>["app-server","mcp-server","exec"].includes(arg)))return null;
    const labels={claude:"Claude Code",codex:"Codex",opencode:"OpenCode","cursor-agent":"Cursor",pi:"Pi",aider:"Aider",gemini:"Gemini",copilot:"Copilot",crush:"Crush",droid:"Droid",amp:"Amp"};
    if(!labels[name])return null;
    return {key:name,name:labels[name],icon:["claude","codex"].includes(name)?`icons/${name}.svg`:"icons/agent.svg",tint:true,agent:true,shell:false};
  }
  snapshot() {
    const data={spaces:spaces(),panes:panes(),agents:agents(),terminals:terminals(),roles:shared("project.roles")||{}};
    data.paneByTerminal=new Map(data.panes.filter(p=>p.terminal).map(p=>[p.terminal,p]));
    data.terminalByAddress=new Map(data.terminals.map(k=>[k.address,k]));
    data.spaceById=new Map(data.spaces.map(s=>[s.id,s]));
    data.contextByTab=new Map(data.spaces.flatMap(space=>space.tabs.map(tab=>[tab.id,{space,tab}])));
    return data;
  }
  allAgents(data=this.snapshot()) {
    const byAddress=new Map();
    for(const a of data.agents) {
      const p=data.paneByTerminal.get(a.address);
      if(p)byAddress.set(a.address,{...a,pane:p.pane});
    }
    for(const p of data.panes) {
      if(!p.terminal||byAddress.has(p.terminal))continue;
      const core=data.terminalByAddress.get(p.terminal);
      const program=p.program?.agent?p.program:core?.state==="live"?this.foregroundAgent(core):null;
      const context=data.contextByTab.get(p.tab);
      if(!program||!context)continue;
      const raw=p.status||core?.status,status=typeof raw==="object"?raw?.state:raw;
      byAddress.set(p.terminal,{address:p.terminal,pane:p.pane,space:context.space.id,tab:p.tab,tab_name:context.tab.name||p.title,title:p.title,program,status:status||"unknown"});
    }
    return [...byAddress.values()];
  }
  members(s, data=this.snapshot(), all=this.allAgents(data)) {
    return all.filter(a=>{const other=data.spaceById.get(a.space);return other && other.machine===s.machine && this.project(other)===this.project(s);});
  }
  refresh(cx) {
    if(this.loading) return;
    this.loading = true;
    cx.spawn(async cx=>{
      try {
        for (const s of spaces()) {
          const p=panes().find(p=>s.tabs.some(t=>t.id===p.tab)&&p.cwd);
          const folder=p?.cwd||s.folder;
          const r=await exec("git",["rev-parse","--show-toplevel"],{cwd:folder,on:s.machine});
          this.roots[s.id]=r.code===0?r.stdout.trim():folder;
        }
        if(!props()?.board) {
          const visited=new Set();
          for(const project of spaces()) {
            const root=this.project(project),key=JSON.stringify([project.machine,root]);
            if(visited.has(key))continue;
            visited.add(key);
            const prior=this.stacks[key];
            if(!prior||Date.now()-prior.at>60000) {
              try {
                const result=await exec("python3",["-c",PROJECT_STACK_PROBE,root],{on:project.machine});
                this.stacks[key]={at:Date.now(),labels:result.code===0?JSON.parse(result.stdout):[]};
              }catch(_){this.stacks[key]={at:Date.now(),labels:[]};}
            }
            try {
              let text=await readTextFile(`${root}/tasks.md`,{on:project.machine});
              if(text===null)text=await readTextFile(`${root}/TASKS.md`,{on:project.machine});
              this.taskCache[key]={tasks:parse(text||""),missing:text===null};
            } catch (_) {this.taskCache[key]={tasks:[],error:true};}
          }
        }
        const s=this.active();
        if(s && props()?.board) {
          const root=props()?.cwd||this.project(s), context=JSON.stringify([s.machine,root]);
          let path=`${root}/tasks.md`, text=await readTextFile(path,{on:s.machine});
          if(text===null) {path=`${root}/TASKS.md`;text=await readTextFile(path,{on:s.machine});}
          if(this.active()?.id!==s.id) return;
          this.context=context;this.path=path;this.text=text;this.tasks=parse(text||"");this.error=text===null?"No tasks.md in this project. Add a Markdown checklist to get started.":null;
        }
      } catch(e) {this.error=String(e);}
      finally {this.loading=false;cx.notify();}
    });
  }
  update(task, changes, cx) {
    const s=this.active(), context=JSON.stringify([s?.machine,props()?.cwd||this.project(s||{})]);
    if(this.saving || context!==this.context || this.text===null) return;
    if(s.machine) {this.error="Edit tasks.md on the remote machine to update this board.";cx.notify();return;}
    const next={...task,...changes}, lines=this.text.split("\n");
    lines[task.index]=`${task.prefix}[${next.state==="done"?"x":" "}] ${task.title} <!-- herdr:${JSON.stringify({state:next.state,agent:next.agent})} -->`;
    const original=this.text,path=this.path;this.saving=true;
    cx.spawn(async cx=>{try{await writeTextFile(path,lines.join("\n"),original);this.error=null;}catch(e){this.error=`Tasks changed elsewhere. Refresh and retry. ${e}`;}finally{this.saving=false;this.refresh(cx);cx.notify();}});
  }
  button(id,text,action,t) {return div().id(id).px(8).py(5).rounded(6).text_size(11).text_color(t.muted).hover(e=>e.bg(t.hover)).cursor_pointer().on_click(action).child(text);}
  board(cx,t) {
    const data=this.snapshot(),s=data.spaces.find(s=>s.active),all=this.allAgents(data);
    const members=s?this.members(s,data,all):[],byAddress=new Map(members.map(a=>[a.address,a]));
    const choices=[null,...members.map(a=>a.address)],buckets=Object.fromEntries(STATES.map(state=>[state,[]]));
    for(const task of this.tasks)buckets[task.state]?.push(task);
    const pages=this.boardPages||{},pageSize=20;
    return v_flex().size_full().min_h(0).bg(t.background).text_color(t.foreground).text_size(13)
      .child(h_flex().h(46).flex_none().px(16).items_center().gap(12).border_b(1).border_color(t.border)
        .when(Boolean(s),e=>e.child(projectBadge(projectIdentity(props()?.cwd||this.project(s),s.machine))))
        .child(div().font_semibold().child("Project tasks"))
        .child(div().flex_1().truncate().text_color(t.dim).child(s?`${props()?.cwd||this.project(s)}/tasks.md`:"Select a project"))
        .child(this.button("refresh","Refresh",(_e,cx)=>this.refresh(cx),t))
        .child(this.button("close","Close",()=>props().overlay?closeOverlay(props().overlay):run("tab.close",{confirmed:true}),t)))
      .when(Boolean(this.error),e=>e.child(div().p(14).text_color(t.blocked).child(this.error)))
      .child(h_flex().flex_1().min_h(0).items_stretch().gap(12).p(14).children(STATES.map(state=>{
        const tasks=buckets[state],page=Math.min(pages[state]||0,Math.max(0,Math.ceil(tasks.length/pageSize)-1));
        const shown=tasks.slice(page*pageSize,(page+1)*pageSize);
        return v_flex().flex_1().min_w(0).min_h(0).rounded(10).bg(t.surface)
          .child(h_flex().px(12).h(38).items_center().gap(8).child(div().font_semibold().child(TITLES[state])).child(div().text_color(t.dim).child(String(tasks.length))))
          .child(v_flex().id(`column-${state}`).flex_1().min_h(0).overflow_y_scrollbar().p(8).gap(8).children(shown.map(task=>{
            const agent=byAddress.get(task.agent);
            return v_flex().p(10).gap(8).rounded(8).border_1().border_color(t.border).bg(t.background)
              .child(div().child(task.title))
              .when(Boolean(task.subtasks?.length),e=>e.child(div().text_size(10).text_color(t.muted).tooltip(task.subtasks.map(sub=>`${sub.checked?"☑":"☐"} ${sub.title}`).join("\n")).child(`${task.subtasks.filter(sub=>sub.checked).length}/${task.subtasks.length} subtasks · one commit`)))
              .child(this.button(`owner-${task.index}`, agent?`${this.role(agent,data.roles)} · ${agent.address} · ${agent.status}`:task.agent?`${task.agent} · offline`:"Assign agent",(_e,cx)=>this.update(task,{agent:choices[(choices.indexOf(task.agent)+1)%choices.length]},cx),t).tooltip("Click to cycle through this project's agents; assignment does not send a prompt"))
              .when(Boolean(agent),e=>e.child(this.button(`focus-${task.index}`,"Go to agent",()=>run("agent.focus",{terminal:agent.address}),t)))
              .child(h_flex().gap(4).children(STATES.filter(v=>v!==state).map(v=>this.button(`state-${task.index}-${v}`,TITLES[v],(_e,cx)=>this.update(task,{state:v},cx),t))));
          })))
          .when(tasks.length>pageSize,e=>e.child(h_flex().px(8).py(4).gap(4).items_center()
            .child(this.button(`prev-${state}`,"‹",(_e,cx)=>{this.boardPages={...(this.boardPages||{}),[state]:Math.max(0,page-1)};cx.notify();},t))
            .child(div().flex_1().text_size(10).text_color(t.dim).child(`${page*pageSize+1}–${Math.min((page+1)*pageSize,tasks.length)} / ${tasks.length}`))
            .child(this.button(`next-${state}`,"›",(_e,cx)=>{this.boardPages={...(this.boardPages||{}),[state]:Math.min(Math.ceil(tasks.length/pageSize)-1,page+1)};cx.notify();},t))));
      })));
  }
  folded(key, fallback=false) {
    const saved=shared("project.folded")||{};
    return Object.prototype.hasOwnProperty.call(saved,key)?saved[key]:fallback;
  }
  toggle(key, fallback=false) {
    setShared("project.folded",{...(shared("project.folded")||{}),[key]:!this.folded(key,fallback)});
  }
  logo(a,t) {
    const p=a.program;
    if(!p?.icon) return svg("icons/agent.svg").size(15).flex_none().text_color(t.muted);
    return p.tint?svg(p.icon).size(15).flex_none().text_color(p.color||t.foreground):image(p.icon).w(15).h(15).flex_none();
  }
  taskLabel(address, cache) {
    const list=(cache?.tasks||[]).filter(t=>t.agent===address && ["doing","review"].includes(t.state));
    return {list,text:list.length?`${TITLES[list[0].state]}: ${list[0].title}${list.length>1?` (+${list.length-1})`:""}`:cache?.error?"Task list unavailable":cache?.missing?"No tasks.md":cache?"No active task assigned":"Loading tasks…"};
  }
  paneKind(p,known,data) {
    if(!p.terminal)return "Panels";
    if(known.has(p.terminal)||p.program?.agent)return "Agents";
    const core=data?data.terminalByAddress.get(p.terminal):terminals().find(k=>k.address===p.terminal);
    if(this.foregroundAgent(core))return "Agents";
    const fg=core?.foreground?.name?.split(/[\\/]/).pop();
    if(fg && !["zsh","bash","sh","fish","nu","pwsh","powershell","cmd","dash","ksh"].includes(fg.replace(/^-/,"")))return "Programs";
    return p.program?.shell?"Shells":"Programs";
  }
  paneLabel(p,data) {
    const core=data?data.terminalByAddress.get(p.terminal):terminals().find(k=>k.address===p.terminal);
    const program=core?.foreground?.name?.split(/[\\/]/).pop()?.replace(/^-/,"")||p.program?.name||p.mod||"Panel";
    const cwd=core?.foreground?.cwd||p.cwd;
    const folder=cwd?.split(/[\\/]/).filter(Boolean).pop();
    return `${p.terminal||"Panel"} · ${program}${folder?` · ${folder}`:""}`;
  }
  agentRow(a, cache, allPanes, t) {
    const assigned=this.taskLabel(a.address,cache),status=a.status||"unknown";
    return v_flex().gap(1).pb(5)
      .child(h_flex().gap(4).items_center()
        .child(h_flex().id(`agent-${a.address}`).flex_1().min_w(0).py(5).gap(6).items_center().cursor_pointer()
          .tooltip(`${a.program?.name||"Agent"} · ${a.address} · ${status}`)
          .on_click(()=>run("pane.focus",{pane:a.pane})).child(this.logo(a,t))
          .child(div().flex_1().min_w(0).truncate().text_color(t[status]||t.muted).child(`${a.address} · ${a.tab_name||a.program?.name||"Agent"}`)))
        .child(this.button(`role-${a.address}`,"↻",()=>{const roles={...(shared("project.roles")||{})};roles[a.address]=ROLES[(ROLES.indexOf(this.role(a))+1)%ROLES.length];setShared("project.roles",roles);},t).tooltip("Cycle role: Planner → Implementer → Reviewer")))
      .child(div().pl(21).text_size(10).text_color(t.dim).child(status))
      .child(div().pl(21).text_size(11).truncate().text_color(assigned.list.length?t.muted:t.dim)
        .tooltip(assigned.list.map(task=>`${TITLES[task.state]}: ${task.title}`).join("\n")||assigned.text).child(assigned.text));
  }
  tabGroups(projectSpaces, allPanes, rootAgents,data) {
    const known=new Set(rootAgents.map(a=>a.address));
    return projectSpaces.flatMap(space=>space.tabs.flatMap(tab=>{
      const list=allPanes.filter(p=>p.tab===tab.id);
      const agents=rootAgents.filter(a=>a.tab===tab.id);
      const extras=list.filter(p=>!rootAgents.some(a=>a.address===p.terminal));
      const groups=[];
      for(const kind of [...new Set([...ROLES,...rootAgents.map(a=>this.role(a,data?.roles)),"Unassigned"])]) {
        const owned=agents.filter(a=>this.role(a,data?.roles)===kind);
        if(owned.length)groups.push({space,tab,panes:list.filter(p=>owned.some(a=>a.address===p.terminal)),agents:owned,extras:[],kind});
      }
      for(const kind of ["Shells","Programs","Panels"]) {
        const owned=extras.filter(p=>this.paneKind(p,known,data)===kind);
        if(owned.length)groups.push({space,tab,panes:owned,agents:[],extras:owned,kind});
      }
      return groups;
    }));
  }
  paneRow(p, tab, space, t,data) {
    const kind=this.paneKind(p,new Set(),data);
    return h_flex().id(`pane-${p.pane}`).py(5).gap(6).items_center().cursor_pointer()
      .tooltip(`${kind==="Shells"?"Shell":p.program?.name||p.mod} · ${p.cwd||""} · Tab: ${tab.name}`)
      .on_click(()=>{run("space.select",{id:space.id});run("tab.select",{id:tab.id});run("pane.focus",{pane:p.pane});})
      .child(p.program?this.logo(p,t):svg("icons/agent.svg").size(15).text_color(t.dim))
      .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(this.paneLabel(p,data)))
      .child(div().text_size(10).text_color(t.dim).child(kind==="Shells"?"shell":kind==="Panels"?"panel":"app"));
  }
  tabRow(group, cache, allPanes, t,data) {
    const {space,tab,agents,extras}=group;
    if(group.panes.length<=1) return v_flex().children(agents.map(a=>this.agentRow(a,cache,allPanes,t))).children(extras.map(p=>this.paneRow(p,tab,space,t,data)));
    const key=`tab-panes:${tab.id}:${group.kind}`,closed=this.folded(key);
    return v_flex().gap(3)
      .child(h_flex().gap(3).items_center()
        .child(this.button(`fold-tab-${tab.id}-${group.kind}`,closed?"▸":"▾",()=>this.toggle(key),t))
        .child(div().id(`select-tab-${tab.id}-${group.kind}`).flex_1().min_w(0).truncate().font_semibold().cursor_pointer()
          .tooltip(`${space.name} / ${tab.name} · ${group.panes.length} panes in this tab`)
          .on_click(()=>{run("space.select",{id:space.id});run("tab.select",{id:tab.id});}).child(`Tab: ${tab.name}`))
        .child(div().text_size(10).text_color(t.dim).child(`${group.panes.length} panes`)))
      .when(!closed,e=>e.child(v_flex().ml(8).pl(8).border_l(1).border_color(t.border)
        .children(agents.map(a=>this.agentRow(a,cache,allPanes,t)))
        .children(extras.map(p=>this.paneRow(p,tab,space,t,data)))));
  }
  render(cx) {
    const t=theme();
    if(props()?.board) return this.board(cx,t);
    const data=this.snapshot(),all=this.allAgents(data),groups=[],identities=shared("project.identities")||{};
    for(const s of data.spaces) {const id=JSON.stringify([s.machine,this.project(s)]);let g=groups.find(g=>g.id===id);if(!g){g={id,s,spaces:[]};groups.push(g);}g.spaces.push(s);}
    setAgentOrder(groups.flatMap(g=>this.members(g.s,data,all).map(a=>a.address)));
    return v_flex().size_full().min_h(0).bg(t.chrome).text_color(t.foreground).text_size(12)
      .child(h_flex().h(38).px(12).items_center().child(div().flex_1().font_semibold().child("Projects & agents"))
        .child(this.button("new-project","+",()=>run("space.new"),t)))
      .child(v_flex().id("projects-scroll").flex_1().min_h(0).overflow_y_scrollbar().px(8).gap(8).children(groups.map(g=>{
        const members=this.members(g.s,data,all),active=g.spaces.some(s=>s.active),root=this.project(g.s);
        const projectPanes=data.panes.filter(p=>g.spaces.some(s=>s.tabs.some(tab=>tab.id===p.tab)));
        const known=new Set(members.map(a=>a.address)),cache=this.taskCache[g.id];
        const roots=members;
        const count=kind=>projectPanes.filter(p=>this.paneKind(p,known,data)===kind).length;
        const paneCounts=[[members.length,"agent"],[count("Shells"),"shell"],[count("Programs"),"program"],[count("Panels"),"panel"]].filter(([n])=>n>0).map(([n,label])=>`${n} ${label}${n===1?"":"s"}`).join(" · ")||"No open panes";
        const identity=projectIdentity(root,g.s.machine,identities);
        const duplicate=groups.some(other=>other.id!==g.id&&projectName(this.project(other.s))===identity.name);
        const parent=String(root||"").replace(/[\\/][^\\/]+[\\/]?$/,"");
        const stack=this.stacks?.[g.id]?.labels||[];
        const details=`${g.s.machine||"Local"} · ${root}${stack.length?"\n"+stack.join(" · "):""}`;
        const key=`project:${g.id}`,closed=this.folded(key,!active);
        let card=v_flex().p(8).gap(5).rounded(8).when(active,e=>e.bg(t.surface))
          .child(h_flex().gap(4).items_center()
            .child(this.button(`fold-${g.id}`,closed?"▸":"▾",()=>this.toggle(key,!active),t).tooltip(closed?"Expand project":"Collapse project"))
            .child(div().id(`project-icon-${g.id}`).cursor_pointer().tooltip(`Change project icon\n${details}`).on_click((_e,cx)=>{cx.stop_propagation();openOverlay({mod:"project-icon",kind:"dialog",width:470,height:470,props:{root,on:g.s.machine}});}).child(projectBadge(identity)))
            .child(div().id(`project-${g.id}`).flex_1().min_w(0).font_semibold().truncate().cursor_pointer().tooltip(details).on_click(()=>run("space.select",{id:g.s.id})).child(identity.name))
            .child(div().text_size(10).text_color(t.dim).tooltip(`${projectPanes.length} open panes\n${paneCounts}`).child(`${projectPanes.length}p`)));
        if(duplicate)card=card.child(div().pl(30).text_size(10).text_color(t.dim).truncate().tooltip(details).child(`${g.s.machine||"Local"} · ${parent}`));
        if(closed) return card;
        return card.child(div().text_size(10).text_color(t.dim).child(paneCounts))
          .when(Boolean(cache?.tasks?.some(task=>["doing","review"].includes(task.state))),e=>e.child(div().text_size(10).text_color(t.working).child(`${cache.tasks.filter(task=>task.state==="doing").length} in progress · ${cache.tasks.filter(task=>task.state==="review").length} in review`)))
          .child(h_flex().gap(4).when(Boolean(cache?.tasks?.length),e=>e.child(this.button(`board-${g.id}`,"Tasks",()=>{run("space.select",{id:g.s.id});openOverlay({mod:"project-hub",props:{board:true},kind:"dialog",width:1100,height:650});},t)))
            .child(this.button(`diff-${g.id}`,"Diff",(_e,cx)=>{cx.spawn(async cx=>{await workflowDiff({space:g.s.id,spaceIds:g.spaces.map(s=>s.id),root,on:g.s.machine});cx.notify();});},t))
            .child(this.button(`editor-${g.id}`,"Editor",(_e,cx)=>{cx.spawn(async cx=>{await workflowEditor({space:g.s.id,root,on:g.s.machine});cx.notify();});},t)))
          .children([...new Set([...ROLES,...members.map(a=>this.role(a,data.roles)),"Unassigned","Shells","Programs","Panels"])].flatMap(kind=>{
            const tabs=this.tabGroups(g.spaces,projectPanes,roots,data).filter(group=>group.kind===kind);
            if(!tabs.length)return [];
            const rk=`tab-kind:${g.id}:${kind}`,folded=this.folded(rk);
            const heading=div().id(rk).pt(6).pb(3).text_size(10).text_color(t.dim).cursor_pointer()
              .on_click(()=>this.toggle(rk)).child(`${folded?"▸":"▾"} ${kind} · ${tabs.length} ${tabs.length===1?"tab":"tabs"}`);
            return [heading,...(folded?[]:tabs.map(group=>this.tabRow(group,cache,projectPanes,t,data)))];
          }));
      })));
  }
}
