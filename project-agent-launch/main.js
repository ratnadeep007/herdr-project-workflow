import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { theme, props, closeOverlay, exec, shared, setShared } from "herdr";

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
export default class AgentLaunch extends View {
  init(_p,cx) {
    this.role="Planner";this.name="";this.custom="";this.busy=false;this.error=null;
    this.nameInput=InputState.new({placeholder:"Optional name, e.g. PROJECT-42"});
    this.roleInput=InputState.new({placeholder:"Mode name, e.g. Tester or Researcher"});
    this.nameInput.on("change",(_e,cx)=>{this.name=this.nameInput.value();cx.notify();});
    this.roleInput.on("change",(_e,cx)=>{this.custom=this.roleInput.value();cx.notify();});
    this.nameInput.on("submit",(_e,cx)=>this.launch(cx));
    this.roleInput.on("submit",(_e,cx)=>this.launch(cx));
    this.handle=cx.focus_handle();this.nameInput.focus();
  }
  chosenRole() {return this.role==="Other"?this.custom.trim():this.role;}
  async createAgent() {
    const p=props()||{},role=this.chosenRole();
    if(!role||!p.agent?.run?.length||!p.space)throw new Error("Choose a mode and project before starting the agent.");
    const name=agentTabName(this.name,role,p.agent.name);
    const r=await exec("herdr-app",["do","tab.new",JSON.stringify({space:p.space,folder:p.folder,name,argv:agentLaunchArgs(p.agent),task:roleIntro(role)})]);
    let result;try{result=JSON.parse(r.stdout);}catch(_){result={};}
    if(r.code!==0||result.error)throw new Error(result.error||r.stderr||"Could not start agent");
    if(result.terminal)setShared("project.roles",{...(shared("project.roles")||{}),[result.terminal]:role});
    return result;
  }
  launch(cx) {
    if(this.busy||!this.chosenRole())return;
    this.busy=true;this.error=null;cx.notify();
    cx.spawn(async cx=>{
      try {await this.createAgent();closeOverlay(props().overlay);}
      catch(error){this.error=String(error);this.busy=false;cx.notify();}
    });
  }
  button(id,label,action,t,enabled=true,selected=false) {
    return div().id(id).px(11).py(7).rounded(7).text_size(12).border_1().border_color(selected?t.accent:t.border)
      .bg(selected?t.selected:t.raised).text_color(enabled?t.foreground:t.dim)
      .when(enabled,e=>e.cursor_pointer().hover(s=>s.bg(t.hover)).on_click(action)).child(label);
  }
  render() {
    const t=theme(),p=props()||{},agent=p.agent,role=this.chosenRole(),name=agentTabName(this.name,role,agent?.name||"Agent");
    return v_flex().id("project-agent-launch").w_full().p(18).gap(12).bg(t.popover).text_color(t.foreground).text_size(13).track_focus(this.handle)
      .on_key_down((e,cx)=>{if(e.key==="escape"&&!this.busy){closeOverlay(p.overlay);cx.stop_propagation();}})
      .child(h_flex().gap(8).items_center()
        .when(Boolean(agent?.icon),e=>e.child(agent.tint?svg(agent.icon).size(20):image(agent.icon).size(20)))
        .child(div().font_semibold().text_size(16).child(`Start ${agent?.name||"agent"}`)))
      .child(div().text_size(11).text_color(t.dim).child("Mode"))
      .child(h_flex().gap(6).children(LAUNCH_ROLES.map(mode=>this.button(`mode-${mode}`,mode,(_e,cx)=>{this.role=mode;cx.notify();if(mode==="Other")this.roleInput.focus();},t,!this.busy,this.role===mode))))
      .when(this.role==="Other",e=>e.child(Input.new(this.roleInput).h(34).px(9).rounded(7).border_1().border_color(t.input).bg(t.background)))
      .child(div().text_size(11).text_color(t.dim).child("Tab name"))
      .child(Input.new(this.nameInput).h(34).px(9).rounded(7).border_1().border_color(t.input).bg(t.background))
      .child(div().text_size(11).text_color(t.muted).truncate().child(role?`Will open: ${name}`:"Enter a custom mode name"))
      .when(Boolean(this.error),e=>e.child(div().text_size(11).text_color(t.blocked).child(this.error)))
      .child(h_flex().gap(8).justify_end()
        .child(this.button("cancel-agent","Cancel",()=>closeOverlay(p.overlay),t,!this.busy))
        .child(this.button("start-agent",this.busy?"Starting…":"Start agent",(_e,cx)=>this.launch(cx),t,Boolean(!this.busy&&role&&agent?.run?.length&&p.space))));
  }
}
