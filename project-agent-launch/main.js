import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { theme, props, closeOverlay, exec, shared, setShared, knownAgents, spaces } from "herdr";

const LAUNCH_ROLES=["Planner","Implementer","Reviewer","Other"];
function agentTabName(name,role,agentName) {
  const title=name.trim()||agentName,mode=role.trim();
  const aliases={Planner:["planner","orchestrator"],Implementer:["implementer","implementor","implmentor"],Reviewer:["reviewer","review"]};
  const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const words=(aliases[mode]||[mode]).map(escape).join("|");
  const present=new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${words})(?=$|[^\\p{L}\\p{N}])`,"iu").test(title);
  return present||!mode?title:`${title} ${mode}`;
}
function agentLaunchArgs(agent) {
  const argv=[...(agent.run||[])];
  if(agent.key==="codex"&&!argv.includes("--no-daemon"))argv.push("--no-daemon");
  return argv;
}
function roleIntro(role) {
  const purpose={Planner:"Plan and coordinate requested work, clarify acceptance criteria, and maintain the project plan when asked.",Implementer:"Implement requested tasks against the project plan and acceptance criteria.",Reviewer:"Review requested changes and report findings and verification gaps."};
  return `Your project role is ${role}. ${purpose[role]||"Work in this role when the user assigns a task."} Wait for the user's task before editing project files, running project actions, or starting additional agents.`;
}
const WORKTREE_CWD = 'import json,os;print(json.dumps({"herdr_worktree_cwd":os.getcwd()}))';
function worktreeInputs(name,branch) {
  const label=name.trim(),ref=branch.trim()||label;
  if(!label||label.length>120||/[\x00-\x1f\x7f]/.test(label))throw new Error("Enter a worktree name (up to 120 characters).");
  return {name:label,branch:ref};
}
function worktreeResult(stdout) {
  let record=null;
  for(const line of stdout.split("\n")) {
    try {const value=JSON.parse(line);if(typeof value.herdr_worktree_cwd==="string")record=value;}catch(_){}
  }
  if(!record?.herdr_worktree_cwd)throw new Error("Worktrunk did not confirm its switched directory. Inspect the worktree before retrying.");
  return record.herdr_worktree_cwd;
}
export default class AgentLaunch extends View {
  init(_p,cx) {
    this.role="Planner";this.name="";this.custom="";this.busy=false;this.error=null;this.phase="";
    this.agent=props()?.agent||null;this.shellOnly=false;this.agents=[];this.worktreeName="";this.branch="";
    this.worktreeInput=InputState.new({placeholder:"Worktree name, e.g. feature-auth"});
    this.branchInput=InputState.new({placeholder:"Same as worktree name"});
    this.worktreeInput.on("change",(_e,cx)=>{this.worktreeName=this.worktreeInput.value();cx.notify();});
    this.branchInput.on("change",(_e,cx)=>{this.branch=this.branchInput.value();cx.notify();});
    if(props()?.worktree)cx.spawn(async cx=>{
      try{const choices=await knownAgents({on:props()?.on});this.agents=[...choices.filter(a=>a.installed),...choices.filter(a=>!a.installed)];}
      catch(_){this.error="Could not find installed agents on this machine.";}
      this.agentsLoaded=true;cx.notify();
    });
    this.nameInput=InputState.new({placeholder:"Optional name, e.g. PROJECT-42"});
    this.roleInput=InputState.new({placeholder:"Mode name, e.g. Tester or Researcher"});
    this.nameInput.on("change",(_e,cx)=>{this.name=this.nameInput.value();cx.notify();});
    this.roleInput.on("change",(_e,cx)=>{this.custom=this.roleInput.value();cx.notify();});
    this.nameInput.on("submit",(_e,cx)=>this.launch(cx));
    this.roleInput.on("submit",(_e,cx)=>this.launch(cx));
    this.handle=cx.focus_handle();if(props()?.worktree)this.worktreeInput.focus();else this.nameInput.focus();
  }
  chosenRole() {return this.role==="Other"?this.custom.trim():this.role;}
  shellSelected() {return Boolean(props()?.worktree&&this.shellOnly);}
  selectedAgent() {return this.shellSelected()?null:this.agent||props()?.agent;}
  async prepareWorktree(p) {
    const input=worktreeInputs(this.worktreeName,this.branch),key=JSON.stringify([p.on||null,p.folder,input]);
    if(this.preparedWorktree?.key===key)return this.preparedWorktree;
    const options={cwd:p.folder,on:p.on||null};
    const ref=await exec("git",["check-ref-format","--branch",input.branch],options);
    if(ref.code!==0)throw new Error("Invalid branch name. Use a Git branch name such as feature-auth or feature/auth.");
    const repo=await exec("git",["rev-parse","--show-toplevel"],options);
    if(repo.code!==0)throw new Error("Open a Git project before creating a worktree.");
    try {
      const version=await exec("wt",["--version"],options);
      if(version.code!==0)throw new Error();
    }catch(_){throw new Error("Worktrunk (wt) is not available on this machine's PATH.");}
    const exists=await exec("git",["show-ref","--verify","--quiet",`refs/heads/${input.branch}`],options);
    if(![0,1].includes(exists.code))throw new Error(exists.stderr||"Could not inspect the branch.");
    const args=["switch",...(exists.code===0?[]:["--create"]),input.branch,"--format","json","--execute","python3","--","-c",WORKTREE_CWD];
    const result=await exec("wt",args,options);
    if(result.code!==0)throw new Error(result.stderr||"Worktrunk could not create or switch the worktree. Approve any pending Worktrunk hooks in a terminal, then retry.");
    const folder=worktreeResult(result.stdout);
    this.preparedWorktree={...input,key,folder};return this.preparedWorktree;
  }
  async createAgent(cx) {
    const p=props()||{},role=this.chosenRole(),agent=this.selectedAgent(),shellOnly=this.shellSelected();
    if(!p.space||(!shellOnly&&(!role||!agent?.run?.length)))throw new Error("Choose an agent, mode, and project before starting.");
    let request,command="tab.new";
    if(p.worktree) {
      this.phase="Creating / switching worktree…";cx?.notify();
      const worktree=await this.prepareWorktree(p);
      const name=shellOnly?(this.name.trim()||"Shell"):agentTabName(this.name||worktree.name,role,agent.name);
      const existing=spaces().find(s=>(s.machine||null)===(p.on||null)&&s.folder===worktree.folder);
      request={folder:worktree.folder,name,...(shellOnly?{}:{argv:agentLaunchArgs(agent),task:roleIntro(role)})};
      if(existing)request.space=existing.id;
      else {command="space.new";request={...request,name:worktree.name,tab:name,machine:p.on||null};}
    }else request={space:p.space,folder:p.folder,name:agentTabName(this.name,role,agent.name),argv:agentLaunchArgs(agent),task:roleIntro(role)};
    this.phase=shellOnly?"Opening shell…":"Starting agent…";cx?.notify();
    const r=await exec("herdr-app",["do",command,JSON.stringify(request)]);
    let result;try{result=JSON.parse(r.stdout);}catch(_){result={};}
    if(r.code!==0||result.error)throw new Error(result.error||r.stderr||(shellOnly?"Could not open shell":"Could not start agent"));
    if(result.terminal&&!shellOnly)setShared("project.roles",{...(shared("project.roles")||{}),[result.terminal]:role});
    return result;
  }
  launch(cx) {
    if(this.busy||(!this.shellSelected()&&!this.chosenRole()))return;
    this.busy=true;this.error=null;cx.notify();
    cx.spawn(async cx=>{
      try {await this.createAgent(cx);closeOverlay(props().overlay);}
      catch(error){this.error=String(error);this.busy=false;cx.notify();}
    });
  }
  button(id,label,action,t,enabled=true,selected=false) {
    return div().id(id).px(11).py(7).rounded(7).text_size(12).border_1().border_color(selected?t.accent:t.border)
      .bg(selected?t.selected:t.raised).text_color(enabled?t.foreground:t.dim)
      .when(enabled,e=>e.cursor_pointer().hover(s=>s.bg(t.hover)).on_click(action)).child(label);
  }
  agentGrid(t) {
    const shellOnly=this.shellSelected(),selected=this.selectedAgent();
    const choices=[{key:"none",name:"None",icon:"icons/shell.svg",tint:true,installed:true,shell:true},...this.agents];
    const rows=[];for(let i=0;i<choices.length;i+=3)rows.push(choices.slice(i,i+3));
    const tile=a=>{
      const enabled=!this.busy&&a.installed,on=a.shell?shellOnly:!shellOnly&&selected?.key===a.key;
      return h_flex().id(`worktree-agent-${a.key}`).flex_1().min_w(0).h(60).px(10).gap(9).items_center().rounded(8)
        .border_1().border_color(on?t.accent:t.border).bg(on?t.selected:t.raised).text_color(enabled?t.foreground:t.dim)
        .tooltip(a.shell?"None — shell only":`${a.name}${a.installed?"":" · Not installed"}`)
        .when(enabled,e=>e.cursor_pointer().hover(s=>s.bg(t.hover)).on_click((_e,cx)=>{
          this.shellOnly=Boolean(a.shell);if(!a.shell)this.agent=a;cx.notify();
        }))
        .child(a.tint?svg(a.icon||"icons/agent.svg").size(22).flex_none().text_color(enabled?t.foreground:t.dim):image(a.icon||"icons/agent.svg").size(22).flex_none())
        .child(v_flex().flex_1().min_w(0).gap(3)
          .child(div().text_size(12).font_semibold().truncate().child(a.name))
          .child(div().text_size(10).text_color(t.dim).child(a.shell?"Shell only":a.installed?"Available":"Not installed")));
    };
    return v_flex().id("worktree-agent-choices").h(Math.min(3,rows.length)*68-8).flex_none().min_h(0).overflow_y_scrollbar().gap(8)
      .children(rows.map((row,i)=>h_flex().id(`worktree-agent-row-${i}`).h(60).flex_none().gap(8).items_stretch()
        .children(row.map(tile)).children(Array.from({length:3-row.length},()=>div().flex_1().min_w(0)))));
  }
  render() {
    const t=theme(),p=props()||{},agent=this.selectedAgent(),role=this.chosenRole(),shellOnly=this.shellSelected(),name=shellOnly?(this.name.trim()||"Shell"):agentTabName(this.name||(p.worktree?this.worktreeName:""),role,agent?.name||"Agent");
    return v_flex().id("project-agent-launch").w_full().max_w(p.worktree?600:520).max_h(p.worktree?690:410).min_h(0).overflow_y_scrollbar().p(18).gap(12).bg(t.popover).text_color(t.foreground).text_size(13).track_focus(this.handle)
      .on_key_down((e,cx)=>{if(e.key==="escape"&&!this.busy){closeOverlay(p.overlay);cx.stop_propagation();}})
      .child(h_flex().gap(8).items_center()
        .when(Boolean(agent?.icon),e=>e.child(agent.tint?svg(agent.icon).size(20):image(agent.icon).size(20)))
        .child(div().font_semibold().text_size(16).child(p.worktree?"Worktrunk worktree":`Start ${agent?.name||"agent"}`)))
      .when(Boolean(p.worktree),e=>e.child(v_flex().gap(8)
        .child(div().text_size(11).text_color(t.dim).child("Worktree name"))
        .child(Input.new(this.worktreeInput).h(34).px(9).rounded(7).border_1().border_color(t.input).bg(t.background))
        .child(div().text_size(11).text_color(t.dim).child("Branch (optional override)"))
        .child(Input.new(this.branchInput).h(34).px(9).rounded(7).border_1().border_color(t.input).bg(t.background))
        .child(div().text_size(10).text_color(t.muted).child(`Branch: ${this.branch.trim()||this.worktreeName.trim()||"enter a worktree name"} · folder follows wt configuration`))
        .child(div().text_size(11).text_color(t.dim).child("Agent"))
        .child(this.agentGrid(t))
        .when(!this.agents.length,e=>e.child(div().text_color(t.dim).child(this.agentsLoaded?"No agent definitions found":"Checking available agents…")))))
      .when(!shellOnly,e=>e.child(div().text_size(11).text_color(t.dim).child("Mode"))
        .child(h_flex().gap(6).children(LAUNCH_ROLES.map(mode=>this.button(`mode-${mode}`,mode,(_e,cx)=>{this.role=mode;cx.notify();if(mode==="Other")this.roleInput.focus();},t,!this.busy,this.role===mode)))))
      .when(!shellOnly&&this.role==="Other",e=>e.child(Input.new(this.roleInput).h(34).px(9).rounded(7).border_1().border_color(t.input).bg(t.background)))
      .child(div().text_size(11).text_color(t.dim).child("Tab name"))
      .child(Input.new(this.nameInput).h(34).px(9).rounded(7).border_1().border_color(t.input).bg(t.background))
      .child(div().text_size(11).text_color(t.muted).truncate().child(shellOnly?`Will open: ${name} (shell)`:role?`Will open: ${name}`:"Enter a custom mode name"))
      .when(Boolean(this.preparedWorktree&&this.error),e=>e.child(div().text_size(10).text_color(t.muted).child(`Worktree ready: ${this.preparedWorktree.folder}. Retry opens the selected terminal here.`)))
      .when(Boolean(this.error),e=>e.child(div().text_size(11).text_color(t.blocked).child(this.error)))
      .child(h_flex().gap(8).justify_end()
        .child(this.button("cancel-agent","Cancel",()=>closeOverlay(p.overlay),t,!this.busy))
        .child(this.button("start-agent",this.busy?(this.phase||"Starting…"):p.worktree?(shellOnly?"Create / switch & open shell":"Create / switch & start"):"Start agent",(_e,cx)=>this.launch(cx),t,Boolean(!this.busy&&p.space&&(shellOnly||(role&&agent?.run?.length))&&(!p.worktree||this.worktreeName.trim())))));
  }
}
