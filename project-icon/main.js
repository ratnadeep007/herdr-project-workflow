import { View, div, image } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { theme, props, shared, setShared, closeOverlay, exec, appHome } from "herdr";

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

const PROJECT_ICON_IMPORT = `import hashlib, json, os, pathlib, shutil, sys
source=pathlib.Path(os.path.expanduser(sys.argv[1])).resolve()
if not source.is_file(): raise ValueError('Choose an existing image file')
if source.stat().st_size>5*1024*1024: raise ValueError('Image must be 5 MB or smaller')
ext=source.suffix.lower()
if ext not in ['.png','.jpg','.jpeg','.webp','.gif','.svg']: raise ValueError('Choose PNG, JPEG, WebP, GIF or SVG')
data=source.read_bytes()
valid=(ext=='.png' and data.startswith(b'\\x89PNG\\r\\n\\x1a\\n')) or (ext in ['.jpg','.jpeg'] and data.startswith(b'\\xff\\xd8')) or (ext=='.gif' and data.startswith((b'GIF87a',b'GIF89a'))) or (ext=='.webp' and data[:4]==b'RIFF' and data[8:12]==b'WEBP') or (ext=='.svg' and '<svg' in data.decode('utf-8-sig')[:8192])
if not valid: raise ValueError('The file does not match a supported image format')
relative='mods/project-icon/assets/'+hashlib.sha256(data).hexdigest()+ext
target=pathlib.Path(sys.argv[2])/relative
target.parent.mkdir(parents=True,exist_ok=True)
if not target.exists(): shutil.copyfile(source,target)
print(json.dumps({'image':relative}))
`;
export default class ProjectIcon extends View {
  init(_p,cx) {
    const p=props()||{},identity=projectIdentity(p.root,p.on);
    this.mode=identity.image?'Image':identity.emoji?'Emoji':'Initials';this.emoji=identity.emoji||'';this.path='';this.error=null;this.busy=false;
    this.emojiInput=InputState.new({placeholder:'Type or paste an emoji'});this.pathInput=InputState.new({placeholder:'Local image path, e.g. ~/Pictures/project.png'});
    this.emojiInput.set_value(this.emoji);
    this.emojiInput.on('change',(_e,cx)=>{this.emoji=this.emojiInput.value();cx.notify();});
    this.pathInput.on('change',(_e,cx)=>{this.path=this.pathInput.value();cx.notify();});
    this.saved=identity;this.handle=cx.focus_handle();
  }
  button(id,label,action,t,selected=false) {
    return div().id(id).px(10).py(7).rounded(6).border_1().border_color(selected?t.accent:t.border).bg(selected?t.selected:t.raised).cursor_pointer().hover(e=>e.bg(t.hover)).on_click((_e,cx)=>{if(!this.busy)action(_e,cx);}).child(label);
  }
  save(cx,reset=false) {
    if(this.busy)return;this.busy=true;this.error=null;cx.notify();
    const p=props()||{},key=projectIdentityKey(p.root,p.on);
    cx.spawn(async cx=>{
      try {
        let value={};
        if(!reset&&this.mode==='Emoji') {
          const emoji=this.emoji.trim();
          if(!emoji||Array.from(emoji).length>24||/[\r\n]/.test(emoji))throw new Error('Enter one emoji or a short symbol.');
          value={emoji};
        }
        if(!reset&&this.mode==='Image') {
          if(this.path.trim()) {
            const r=await exec('python3',['-c',PROJECT_ICON_IMPORT,this.path.trim(),appHome()]);
            if(r.code!==0)throw new Error(r.stderr.split('\n').filter(Boolean).pop()||'Could not import image');
            value=JSON.parse(r.stdout);
          }else if(this.saved.image)value={image:this.saved.image};
          else throw new Error('Choose an image or enter its path.');
        }
        const all={...(shared('project.identities')||{})};
        if(reset||this.mode==='Initials')delete all[key];else all[key]=value;
        setShared('project.identities',all);closeOverlay(p.overlay);
      }catch(error){this.error=String(error);this.busy=false;cx.notify();}
    });
  }
  browse(cx) {
    if(this.busy)return;this.busy=true;this.error=null;cx.notify();
    cx.spawn(async cx=>{
      try {
        const result=await exec('osascript',['-e','POSIX path of (choose file with prompt "Choose a project icon" of type {"public.image"})']);
        if(result.code===0){this.path=result.stdout.trim();this.pathInput.set_value(this.path);}
        else if(!result.stderr.includes('(-128)'))this.error='Could not open the file picker. Enter the image path below.';
      }catch(_){this.error='Enter the local image path below.';}
      finally{this.busy=false;cx.notify();}
    });
  }
  render() {
    const t=theme(),p=props()||{},base=projectIdentity(p.root,p.on,{});
    const preview={...base,...(this.mode==='Emoji'?{emoji:this.emoji}:this.mode==='Image'?{image:this.saved.image}:{})};
    return v_flex().w_full().p(18).gap(12).bg(t.popover).text_color(t.foreground).text_size(12).track_focus(this.handle)
      .on_key_down((e,cx)=>{if(e.key==='escape'&&!this.busy){closeOverlay(p.overlay);cx.stop_propagation();}})
      .child(h_flex().items_center().gap(12).child(projectBadge(preview,40)).child(v_flex().min_w(0).gap(5).child(div().font_semibold().text_size(16).child(base.name)).child(div().truncate().text_size(10).text_color(t.dim).tooltip(p.root||'').child(p.root||'Project icon'))))
      .child(div().text_color(t.muted).child('Project identity'))
      .child(h_flex().gap(6).children(['Initials','Emoji','Image'].map(mode=>this.button('icon-mode-'+mode,mode,(_e,cx)=>{this.mode=mode;this.error=null;cx.notify();if(mode==='Emoji')this.emojiInput.focus();},t,this.mode===mode))))
      .when(this.mode==='Initials',e=>e.child(div().text_color(t.dim).child('Initials and color stay consistent for this project path and machine.')))
      .when(this.mode==='Emoji',e=>e.child(v_flex().gap(10)
        .child(h_flex().gap(6).children(['🚀','🌿','🧭','🛠️','📚','🧪','🪐','🎯'].map((emoji,i)=>this.button('emoji-'+i,emoji,(_e,cx)=>{this.emoji=emoji;this.emojiInput.set_value(emoji);cx.notify();},t,this.emoji===emoji))))
        .child(Input.new(this.emojiInput).h(34).px(9).rounded(6).border_1().border_color(t.input).bg(t.background))))
      .when(this.mode==='Image',e=>e.child(v_flex().gap(10)
        .child(this.button('browse-project-image','Choose local image…',(_e,cx)=>this.browse(cx),t))
        .child(Input.new(this.pathInput).h(34).px(9).rounded(6).border_1().border_color(t.input).bg(t.background))
        .child(div().text_size(10).text_color(t.dim).child('PNG, JPEG, WebP, GIF or SVG · up to 5 MB. Copied into Herdr so the icon survives moving the original.'))))
      .when(Boolean(this.error),e=>e.child(div().text_color(t.blocked).child(this.error)))
      .child(h_flex().gap(8).justify_end()
        .child(this.button('reset-project-icon','Reset',(_e,cx)=>this.save(cx,true),t))
        .child(this.button('cancel-project-icon','Cancel',()=>closeOverlay(p.overlay),t))
        .child(this.button('save-project-icon',this.busy?'Working…':'Save',(_e,cx)=>this.save(cx),t)));
  }
}
