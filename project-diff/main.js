// SPDX-License-Identifier: Apache-2.0
// Modified from Herdr 0.1.11: project workflow navigation and tools.
import { View, div, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, watchFolder, theme, settings, props, agents, shared, hc, setShared, run, notify } from "herdr";

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

function location() {
  if(props()?.cwd) return {cwd:props().cwd,on:props().on||null};
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on };
}
const key = () => JSON.stringify(location());
// Reads write nothing under .git (no index refresh or lock, no fsmonitor cookie):
// the folder watch would see it, and every refresh would start the next one.
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"];
const countLines = (text) => text ? text.split("\n").length - Number(text.endsWith("\n")) : 0;

// Numbers each diff line once, so a frame only draws the rows on screen.
function diffRows(lines) {
  let old = 0, next = 0;
  return lines.map((line) => {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    if (match) { old = +match[1]; next = +match[2]; return { kind: "@", text: line }; }
    const kind = line[0];
    if (kind === "-") return { kind, number: old++, text: line.slice(1) || " " };
    if (kind === "+") return { kind, number: next++, text: line.slice(1) || " " };
    if (kind === " ") { old++; return { kind, number: next++, text: line.slice(1) || " " }; }
    return { kind: "", text: line };
  });
}

function treeRows(files) {
  const rows = [], seen = new Set();
  for (const f of [...files].sort((a,b)=>a.path.localeCompare(b.path))) {
    const parts=f.path.split('/');
    for(let i=1;i<parts.length;i++) {
      const path=parts.slice(0,i).join('/');
      if(!seen.has(path)){seen.add(path);rows.push({folder:true,path,depth:i-1,name:parts[i-1]});}
    }
    rows.push({...f,depth:parts.length-1});
  }
  return rows;
}
export default class Changes extends View {
  init(_props, cx) {
    this.files = []; this.rows = []; this.diffWidth = 0; this.message = ""; this.showCommits=true; this.commits=[]; this.revision=null; this.comments=[]; this.recipients=[]; this.anchor=null; this.selectedAgent=null; this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Write a review comment…" });
    this.input.on("change", (_e, cx) => {
      const hadMessage = Boolean(this.message.trim());
      this.message = this.input.value();
      if (hadMessage !== Boolean(this.message.trim())) cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.addComment(cx));
    this.input.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    this.refresh(cx);
    cx.timer.every(10000, (cx) => this.refresh(cx));
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    cx.spawn(async (cx) => {
      try {
        while (this.watched === root) {
          await watchFolder(root);
          if (this.watched === root) this.refresh(cx);
        }
      } catch { this.watched = null; }
    });
  }

  refresh(cx) {
    if (this.loading || this.busy) return;
    const { cwd, on } = location(), context = key();
    if (context !== this.context) {
      this.context = context; this.root = null; this.files = []; this.open = null; this.revision=props()?.revision||null; this.commits=[]; this.anchor=null; this.comments=[]; this.draftId=null; this.selectedAgent=null;
      this.setLines([]); this.message = ""; this.input.set_value(""); this.error = null; this.note = null; this.watched = null; this.closed = false; this.limited = false;
    }
    if (!cwd) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
        if (key() !== context) return;
        if (top.code !== 0) { this.root = null; this.files = []; this.setLines([]); this.open = null; this.error = "Not a git repository"; return; }
        const root = top.stdout.trim(), git = (args) => exec("git", [...READ, ...args], { cwd: root, on });
        const history=await git(["log","-40","--format=%H%x00%h%x00%s%x00%an%x00%aI"]);
        const commits=history.code===0?history.stdout.trim().split("\n").filter(Boolean).map(line=>{const [hash,short,title,author,date]=line.split("\0");return {hash,short,title,author,date};}):[];
        const selected=this.revision;
        if(selected) {
          const parent=await git(["rev-list","--parents","-n","1",selected]);
          if(parent.code!==0)throw new Error(parent.stderr);
          const firstParent=parent.stdout.trim().split(/\s+/)[1];
          const base=firstParent?["diff",firstParent,selected]:["diff-tree","--root","--no-commit-id","-r",selected];
          const result=await git([...base,"--numstat","-z","--no-renames","--no-ext-diff","--no-textconv"]);
          const names=await git([...base,"--name-status","-z","--no-renames","--no-ext-diff","--no-textconv"]);
          if(result.code!==0||names.code!==0)throw new Error(result.stderr||names.stderr);
          const stats={};
          for(const entry of result.stdout.split("\0")){const [a,d,...path]=entry.split("\t");if(path.length)stats[path.join("\t")]={add:Number(a)||0,del:Number(d)||0,binary:a==="-"};}
          const entries=names.stdout.split("\0").filter(Boolean), files=[];
          for(let i=0;i+1<entries.length;i+=2)files.push({path:entries[i+1],status:entries[i][0],fresh:false,...(stats[entries[i+1]]||{add:0,del:0})});
          if(key()!==context||this.revision!==selected)return;
          this.root=root;this.on=on;this.parent=firstParent;this.commits=commits;this.files=files.slice(0,1000);this.limited=files.length>1000;this.error=null;
          this.readDrafts();this.watch(root,cx);await this.findRecipients(context);
          if(!this.files.some(f=>f.path===this.open))this.open=this.files[0]?.path||null;
          if(this.open)await this.load(this.open,context);
          return;
        }
        const status = await git(["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"]);
        if (status.code !== 0) throw new Error(status.stderr);
        const head = await git(["rev-parse", "--verify", "HEAD"]);
        const stats = {};
        const results = head.code === 0 ? [await git(["diff", "HEAD", "--numstat", "-z", "--no-renames"])] : [await git(["diff", "--cached", "--numstat", "-z", "--no-renames"]), await git(["diff", "--numstat", "-z", "--no-renames"])];
        for (const result of results) {
          if (result.code !== 0) throw new Error(result.stderr);
          for (const entry of result.stdout.split("\0")) {
            const [a, d, ...parts] = entry.split("\t");
            if (!parts.length) continue;
            const path = parts.join("\t"), old = stats[path] ?? { add: 0, del: 0 };
            stats[path] = { add: old.add + (Number(a) || 0), del: old.del + (Number(d) || 0), binary: a === "-" };
          }
        }
        const files = [];
        const entries = status.stdout.split("\0").filter(Boolean);
        for (const entry of entries.slice(0, 1000)) {
          const xy = entry.slice(0, 2), path = entry.slice(3), fresh = xy === "??";
          const conflict = xy.includes("U") || xy === "AA" || xy === "DD";
          const s = conflict ? "U" : xy.includes("D") ? "D" : fresh || xy.includes("A") ? "A" : "M";
          const stat = stats[path] ?? { add: 0, del: 0 };
          files.push({ path, status: s, fresh, ...stat });
        }
        if (key() !== context) return;
        this.root = root; this.on = on; this.hasHead = head.code === 0; this.files = files; this.limited = entries.length > 1000; this.error = null;
        this.commits=commits;this.parent=null;this.readDrafts();await this.findRecipients(context);
        this.watch(root, cx);
        if (this.open && !files.some((f) => f.path === this.open)) { this.open = null; this.setLines([]); }
        // The first file's diff shows until you pick another.
        if (!this.open && !this.closed && files.length) this.open = files[0].path;
        if (this.open) {
          try { await this.load(this.open, context); }
          catch { if (key() === context) this.setLines(["Cannot preview this diff (too large or unreadable)"]); }
        }
      } catch (e) { if (key() === context) this.error = String(e); }
      finally { this.loading = false; cx.notify(); }
    });
  }

  async load(path, context) {
    const file = this.files.find((f) => f.path === path), root = this.root, on = this.on;
    if (!file) return;
    let lines;
    const revision=this.revision;
    if (!revision && (file.fresh || (!this.hasHead && file.status === "A"))) {
      const text = await readTextFile(`${root}/${path}`, { on }).catch(() => null);
      if (text === null) lines = ["Cannot preview this file (binary, too large, or unreadable)"];
      else if (text.includes("\0")) lines = ["Binary file · no text diff"];
      else {
        file.add = countLines(text);
        lines = [`@@ -0,0 +1,${file.add} @@`, ...text.slice(0, 400000).replace(/\n$/, "").split("\n").slice(0, 1500).map(l => `+${l}`)];
      }
    } else {
      const command=revision?(this.parent?["diff",this.parent,revision]:["show","--format=","--root",revision]):["diff",...(this.hasHead?["HEAD"]:[])];
      const r = await exec("git", [...READ, ...command, "--no-ext-diff", "--no-textconv", "--no-color", "--", path], { cwd: root, on });
      if (r.code !== 0) throw new Error(r.stderr);
      const all = r.stdout.replace(/\n$/, "").split("\n"), first = all.findIndex((l) => l.startsWith("@@"));
      lines = first < 0 ? [file.binary ? "Binary file changed" : "No text diff available"] : all.slice(first);
    }
    if (key() === context && this.open === path && this.revision===revision) this.setLines(lines.slice(0, 1500).map(line => line.length > 4000 ? line.slice(0, 4000) + "… (line truncated)" : line));
  }

  setLines(lines) {
    const next=diffRows(lines);
    if(this.anchor && JSON.stringify(next)!==JSON.stringify(this.rows)) {
      this.anchor=null;this.selectionRange=null;this.selectionStart=undefined;this.dragging=false;
    }
    this.rows = next;
    this.diffWidth = Math.max(300, ...lines.map(line => line.length * 7 + 50));
  }

  pick(path, cx) {
    this.open = this.open === path ? null : path; this.setLines([]); this.anchor=null; this.note = null;
    this.closed = !this.open;
    const context = this.context;
    if (this.open) cx.spawn(async (cx) => {
      try { await this.load(path, context); }
      catch (e) { if (key() === context && this.open === path) this.note = `Cannot preview this diff (too large or unreadable): ${e}`; }
      cx.notify();
    });
    cx.notify();
  }

  draftKey() {return `review:${JSON.stringify([this.on||null,this.root])}`;}
  readDrafts() {
    const id=this.draftKey();
    if(this.draftId===id)return;
    this.draftId=id;
    try{this.comments=JSON.parse(localStorage.getItem(id)||"[]");}catch(_){this.comments=[];}
  }
  saveDrafts(){localStorage.setItem(this.draftKey(),JSON.stringify(this.comments));}
  chooseRevision(hash,cx) {
    if(this.loading||this.sending)return;
    this.revision=hash;this.open=null;this.anchor=null;this.closed=false;this.setLines([]);this.refresh(cx);cx.notify();
  }
  async findRecipients(context) {
    const root=this.root,on=this.on;
    const result=[];
    for(const a of agents()) {
      const space=spaces().find(s=>s.id===a.space);
      if(!space||(space.machine||null)!==(on||null))continue;
      const cwd=panes().find(p=>p.terminal===a.address)?.cwd||space.folder;
      const r=await exec("git",[...READ,"rev-parse","--show-toplevel"],{cwd,on});
      if(r.code===0&&r.stdout.trim()===root)result.push(a);
    }
    if(key()!==context||this.root!==root)return;
    this.recipients=result;
    const roles=shared("project.roles")||{};
    const planners=result.filter(a=>roles[a.address]?roles[a.address]==="Planner":!/review/i.test(`${a.tab_name} ${a.title}`)&&/plan|orchestrat/i.test(`${a.tab_name} ${a.title}`));
    this.planners=planners;
    if(this.selectedAgent&&!result.some(a=>a.address===this.selectedAgent))this.selectedAgent=null;
    if(!this.selectedAgent&&planners.length===1)this.selectedAgent=planners[0].address;
  }
  commentLocation(c) {
    if(!c.line)return `${c.file} (file comment)`;
    if(c.endLine!==undefined && (c.endLine!==c.line || c.endSide!==c.side)) {
      return c.endSide===c.side?`${c.file}:${c.line}-${c.endLine} (${c.side})`:`${c.file}:${c.line} (${c.side}) → ${c.endLine} (${c.endSide})`;
    }
    return `${c.file}:${c.line} (${c.side})`;
  }
  selectLine(index,extend,cx,focus=true) {
    const row=this.rows[index];
    if(!row||row.number===undefined)return;
    if(!extend||!this.anchor||this.selectionStart===undefined)this.selectionStart=index;
    const start=Math.min(this.selectionStart,index),end=Math.max(this.selectionStart,index);
    const selected=this.rows.slice(start,end+1).filter(r=>r.number!==undefined);
    const first=selected[0],last=selected[selected.length-1];
    this.anchor={line:first.number,side:first.kind==="-"?"old":"new",endLine:last.number,endSide:last.kind==="-"?"old":"new",
      snippet:selected.map(r=>`${r.kind}${r.text}`).join("\n")};
    this.selectionRange={start,end};if(focus)this.input.focus();cx.notify();
  }
  beginRange(index,shift,cx) {
    if(this.rows[index]?.number===undefined)return;
    this.dragging=true;this.dragEnd=index;this.selectLine(index,shift,cx,false);
  }
  extendRange(index,cx) {
    if(!this.dragging||this.dragEnd===index||this.rows[index]?.number===undefined)return;
    this.dragEnd=index;this.selectLine(index,true,cx,false);
  }
  endRange(cx,focus=true) {
    if(!this.dragging)return;
    this.dragging=false;if(focus)this.input.focus();cx.notify();
  }
  addComment(cx) {
    if(!this.message.trim()||!this.root||!this.open||this.loading||this.sending)return;
    this.comments.push({id:`${Date.now()}-${this.comments.length}`,revision:this.revision||"working tree",file:this.open,...(this.anchor||{}),message:this.message.trim()});
    this.saveDrafts();this.message="";this.input.set_value("");this.anchor=null;this.note="Comment added to review";cx.notify();
  }
  reviewMessage(comments=this.comments) {
    return `Diff review for ${this.root}\n${this.on?`Machine: ${this.on}\n`:""}Please assess these comments against the referenced revision and plan the needed changes.\n\n`+comments.map((c,i)=>`${i+1}. ${c.revision} · ${this.commentLocation(c)}\n${c.snippet?`Code: ${c.snippet}\n`:""}${c.message}`).join("\n\n");
  }
  sendReview(cx) {
    if(this.sending||!this.comments.length)return;
    if(!this.selectedAgent){this.chooseAgent=true;cx.notify();return;}
    if(!this.recipients.some(a=>a.address===this.selectedAgent)){this.note="Recipient is no longer available. Choose an agent.";this.selectedAgent=null;this.chooseAgent=true;cx.notify();return;}
    const target=this.selectedAgent,batch=this.comments.slice(),root=this.root,payload=this.reviewMessage(batch);
    this.sending=true;this.note=null;
    cx.spawn(async cx=>{
      try {
        const r=await hc(["send",target,payload,"--json"]);
        if(r.code!==0)throw new Error(r.stderr||r.stdout||"Send failed");
        if(this.root===root){const ids=new Set(batch.map(c=>c.id));this.comments=this.comments.filter(c=>!ids.has(c.id));this.saveDrafts();this.note=`Review sent to ${target}`;}
      }catch(e){this.note=`Could not confirm delivery: ${String(e).slice(0,400)}. Comments kept; check the agent before retrying.`;}
      finally{this.sending=false;cx.notify();}
    });cx.notify();
  }
  button(id,text,action,t,enabled=true) {
    return div().id(id).px(9).py(5).rounded(6).text_size(11).text_color(enabled?t.foreground:t.dim)
      .when(enabled,e=>e.cursor_pointer().hover(s=>s.bg(t.hover)).on_click(action)).child(text);
  }
  openEditor(file,cx) {
    if(!this.root)return;
    const space=spaces().find(s=>s.active);
    const line=file===this.open?(this.anchor?.endSide==="new"?this.anchor.endLine:this.anchor?.side==="new"?this.anchor.line:null):null;
    cx.spawn(async cx=>{await workflowEditor({space:space?.id,root:this.root,on:this.on,file:`${this.root}/${file}`,line});cx.notify();});
  }
  reviewUI(t) {
    const selected=this.recipients.find(a=>a.address===this.selectedAgent);
    return v_flex().flex_none().border_t(1).border_color(t.border).p(10).gap(5)
      .child(div().text_size(11).text_color(t.dim).truncate().child(this.anchor?this.commentLocation({file:this.open,...this.anchor}):this.open?`${this.open} · drag across lines to select a range (or Shift-click)`:"Select a file to comment"))
      .child(h_flex().gap(6).items_center()
        .child(Input.new(this.input).flex_1().h(32).px(8).rounded(6).border_1().border_color(t.input).bg(t.background).text_size(12))
        .child(this.button("add-review-comment","Add",(_e,cx)=>this.addComment(cx),t,Boolean(this.message.trim()&&this.open&&!this.loading&&!this.sending))))
      .when(this.comments.length>0,e=>e.child(v_flex().id("review-comments").max_h(130).overflow_y_scrollbar().gap(4).children(this.comments.map(c=>h_flex().gap(5).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(11).tooltip(`${c.revision} · ${this.commentLocation(c)}\n${c.message}`).child(`${this.commentLocation(c)} · ${c.message}`))
        .child(this.button(`remove-${c.id}`,"×",(_e,cx)=>{if(this.sending)return;this.comments=this.comments.filter(x=>x.id!==c.id);this.saveDrafts();cx.notify();},t,!this.sending))))))
      .child(h_flex().gap(6).items_center()
        .child(this.button("choose-recipient",selected?`To: ${selected.tab_name} (${selected.address})`:"Choose agent…",(_e,cx)=>{this.chooseAgent=!this.chooseAgent;cx.notify();},t,!this.sending))
        .child(div().flex_1())
        .child(this.button("send-review",this.sending?"Sending…":`Send review (${this.comments.length})`,(_e,cx)=>this.sendReview(cx),t,Boolean(this.comments.length&&!this.sending))))
      .when(Boolean(this.chooseAgent),e=>e.child(v_flex().id("review-recipients").max_h(150).overflow_y_scrollbar()
        .child(div().text_size(11).text_color(t.dim).child(this.planners?.length?"Choose a recipient":"No planner found. Which agent should receive this review?"))
        .children(this.recipients.map(a=>this.button(`recipient-${a.address}`,`${a.tab_name} · ${a.program?.name||a.app} · ${a.address} · ${a.status}`,(_e,cx)=>{this.selectedAgent=a.address;this.chooseAgent=false;cx.notify();},t)))
        .when(!this.recipients.length,e=>e.child(div().text_size(11).text_color(t.dim).child("No agents in this project. Start one, then refresh.")))));
  }

  diffRow({ kind, number, text }, t, index) {
    if (kind === "@") return div().w_full().px(12).h(20).flex_none().truncate().bg(t.raised).text_color(t.dim).child(text);
    return h_flex().id(`diff-line-${kind}-${number}`).w_full().h(20).flex_none().gap(10).cursor_pointer()
      .tooltip("Drag across lines to select a range; Shift-click also extends the range")
      .on_mouse_down("left",(e,cx)=>{this.beginRange(index,Boolean(e.modifiers?.shift),cx);cx.stop_propagation();})
      .on_mouse_move((_e,cx)=>this.extendRange(index,cx)).when(kind === "+", (e) => e.bg(t.ansi2 + "18")).when(kind === "-", (e) => e.bg(t.ansi1 + "18"))
      .when(Boolean(this.anchor&&this.selectionRange&&index>=this.selectionRange.start&&index<=this.selectionRange.end),e=>e.bg(t.selected))
      .child(div().id(`comment-line-${kind}-${number}`).w(20).flex_none().text_center().text_color(t.accent)
        .tooltip("Add comment on this line").child(number===undefined?"":"+"))
      .child(div().w(30).flex_none().text_right().text_color(t.dim).child(number === undefined ? "" : String(number)))
      .child(div().flex_1().min_w(0).truncate().child(text));
  }

  render(cx) {
    if (key() !== this.context) this.refresh(cx);
    const t = theme(), add = this.files.reduce((n, f) => n + f.add, 0), del = this.files.reduce((n, f) => n + f.del, 0);
    const enabled = Boolean(this.message.trim() && this.root && !this.busy && !this.loading);
    return v_flex().id("changes").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13).track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape" && this.typing) { this.typing = false; this.handle.focus(); cx.stop_propagation(); cx.notify(); }
      })
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .when(Boolean(this.root),e=>e.child(projectBadge(projectIdentity(this.root,props()?.on),20)))
        .child(div().font_semibold().child(this.revision?"Commit diff":"Working tree"))
        .child(this.button("toggle-commits",this.showCommits?"Hide commits":"Commits (latest 40)",(_e,cx)=>{this.showCommits=!this.showCommits;cx.notify();},t))
        .child(div().px(5).py(1).rounded(4).border_1().border_color(t.border).text_size(10).text_color(t.muted).child(`${this.files.length} files`))
        .child(this.button("refresh-review","Refresh",(_e,cx)=>this.refresh(cx),t,!this.loading&&!this.sending))
        .child(this.button("open-nvim","Open in nvim",(_e,cx)=>this.openEditor(this.open,cx),t,Boolean(this.open&&this.root&&!this.loading)).tooltip("Open the working-tree file in this project's reusable Editor tab"))
        .child(div().flex_1()).child(div().text_size(11).text_color(t.ansi2).child(`+${add}`)).child(div().text_size(11).text_color(t.ansi1).child(`−${del}`)))
      .when(Boolean(this.showCommits),e=>e.child(v_flex().id("commit-list").h(160).flex_none().overflow_y_scrollbar().p(6)
        .child(this.button("working-tree","Working tree (uncommitted)",(_e,cx)=>this.chooseRevision(null,cx),t,!this.loading&&!this.sending))
        .children(this.commits.map(c=>this.button(`commit-${c.hash}`,`${this.revision===c.hash?"● ":""}${c.short} · ${c.title}`,(_e,cx)=>this.chooseRevision(c.hash,cx),t,!this.loading&&!this.sending).tooltip(`${c.author} · ${c.date}\n${c.hash}`)))
        .when(!this.commits.length,e=>e.child(div().p(6).text_color(t.dim).child("No commits yet")))))
      .when(Boolean(this.revision),e=>e.child(div().px(12).py(4).truncate().text_size(11).text_color(t.dim).tooltip(this.revision).child(this.commits.find(c=>c.hash===this.revision)?.title||this.revision)))
      .child(v_flex().id("changes-list").flex_none().h(Math.min(280, Math.max(44, treeRows(this.files).length * 28 + 12))).overflow_y_scrollbar().p(6).border_b(1).border_color(t.border).children(treeRows(this.files).map((f) => {
        if(f.folder) return div().h(25).flex_none().pl(8+f.depth*14).text_color(t.dim).child(`▾ ${f.name}`);
        const parts = f.path.split("/"), name = parts.pop();
        return h_flex().id(`change-${f.path}`).h(28).flex_none().pl(8+f.depth*14).pr(8).gap(8).items_center().rounded(7).cursor_pointer().when(this.open === f.path, (e) => e.bg(t.selected)).hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.pick(f.path, cx))
          .child(div().w(14).text_size(11).text_color(f.status === "A" ? t.ansi2 : f.status === "D" ? t.ansi1 : f.status === "U" ? t.ansi1 : t.blocked).child(f.status))
          .child(h_flex().flex_1().min_w(0).child(div().text_color(t.dim).truncate().child("")).child(div().max_w(260).min_w(0).truncate().child(name)))
          .child(this.button(`edit-${f.path}`,"nvim",(_e,cx)=>{cx.stop_propagation();this.openEditor(f.path,cx);},t).tooltip("Open this working-tree file in the existing project editor"))
          .when(f.add > 0, (e) => e.child(div().text_size(11).text_color(t.ansi2).child(`+${f.add}`))).when(f.del > 0, (e) => e.child(div().text_size(11).text_color(t.ansi1).child(`−${f.del}`)));
      })).when(!this.files.length, (e) => e.child(div().p(8).text_color(t.dim).child(this.error || (this.loading ? "Loading changes…" : this.root ? (this.revision?"No changed files in this commit":"No uncommitted changes") : "No folder")))))
      .when(this.limited, el => el.child(div().px(12).py(4).text_size(11).text_color(t.dim).child("Showing the first 1,000 changed files")))
      .child(div().px(12).py(4).text_size(10).text_color(t.dim).child(`${this.rows.length} diff lines · drag across lines or Shift-click + to select a range`))
      .child(v_flex().id("diff-scroll")
        .on_mouse_up("left",(_e,cx)=>this.endRange(cx))
        .on_hover((hovered,cx)=>{if(!hovered)this.endRange(cx,false);})
        .on_mouse_down_out((_e,cx)=>this.endRange(cx,false))
        .flex_1().min_h(0).overflow_y_scrollbar().overflow_x_scrollbar()
        .font_family(settings().font_family ?? "JetBrains Mono").text_size(11)
        .child(v_flex().min_w(this.diffWidth).w_full().children(this.rows.map((row,index)=>this.diffRow(row,t,index))))
        .when(!this.rows.length,e=>e.child(div().p(12).text_color(t.dim).child(this.loading?"Loading diff…":this.open?"No text diff available":"Select a file to view its changes"))))
      .child(this.reviewUI(t))
      .when(Boolean(this.note), (e) => e.child(div().px(10).pb(8).text_size(11).text_color(t.muted).child(this.note)));
  }
}
