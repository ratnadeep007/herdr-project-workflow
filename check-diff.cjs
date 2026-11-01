const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'herdr-review-'));
function git(...args){return cp.execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();}
git('init','-q');git('config','user.name','Test');git('config','user.email','test@example.invalid');
fs.writeFileSync(path.join(root,'one.txt'),'before\n');git('add','.');git('commit','-qm','Initial');const initial=git('rev-parse','HEAD');
fs.writeFileSync(path.join(root,'one.txt'),'after\n');git('commit','-qam','Change one');const changed=git('rev-parse','HEAD');
fs.writeFileSync(path.join(root,'one.txt'),'working\n');
let calls=[],delivery={code:0,stdout:'{}',stderr:''},roles={},storage=new Map();
const agent={address:'t-plan',space:'s',tab_name:'Planner',title:'',status:'idle',program:{name:'Claude Code'}};
const input={value:()=>'',set_value:()=>{},on:()=>{},focus:()=>{}};
const env={View:class{},props:()=>({cwd:root}),spaces:()=>[{id:'s',machine:null,folder:root}],panes:()=>[{terminal:'t-plan',cwd:root}],focused:()=>null,
  agents:()=>[agent],shared:()=>roles,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
  InputState:{new:()=>input},readTextFile:async p=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):null,
  hc:async args=>{calls.push(args);return delivery;},exec:async(command,args,options)=>{
    const r=cp.spawnSync(command,args,{cwd:options?.cwd||root,encoding:'utf8'});return {code:r.status,stdout:r.stdout||'',stderr:r.stderr||''};}};
const source=fs.readFileSync(`${__dirname}/project-diff/main.js`,'utf8').replace(/^import .*;\n/gm,'').replace('export default class Changes','class Changes');
const Changes=new Function('env',`const {${Object.keys(env).join(',')}}=env;${source};return Changes;`)(env);
const jobs=[],cx={focus_handle:()=>({}),timer:{every:()=>{}},notify:()=>{},spawn:fn=>jobs.push(fn(cx))};
async function drain(){while(jobs.length)await jobs.shift();}
(async()=>{
 const view=new Changes();view.watch=()=>{};view.init({},cx);await drain();
 assert.equal(view.files[0].path,'one.txt');assert.equal(view.commits.length,2);assert.equal(view.selectedAgent,'t-plan');
 assert.ok(view.rows.some(r=>r.text==='working'&&r.kind==='+'));
 view.chooseRevision(initial,cx);await drain();assert.equal(view.files[0].status,'A');assert.ok(view.rows.some(r=>r.text==='before'&&r.kind==='+'));
 view.chooseRevision(changed,cx);await drain();assert.ok(view.rows.some(r=>r.text==='after'&&r.kind==='+'));assert.ok(!view.rows.some(r=>r.text==='working'));
 view.message='Please simplify this';view.anchor={line:1,side:'new',snippet:'after'};view.addComment(cx);
 assert.equal(view.comments.length,1);assert.equal(view.comments[0].revision,changed);assert.match(view.reviewMessage(),/one.txt:1 \(new\)/);
 const actualRows=view.rows;
 view.rows=[{kind:'@',text:'@@ -10,2 +10,2 @@'},
   {kind:'-',number:10,text:'old first'},{kind:'-',number:11,text:'old last'},
   {kind:'+',number:10,text:'new first'},{kind:'+',number:11,text:'new last'}];
 view.beginRange(4,false,cx);view.extendRange(3,cx);view.endRange(cx);
 assert.equal(view.dragging,false);assert.equal(view.anchor.line,10);assert.equal(view.anchor.endLine,11);assert.equal(view.anchor.side,'new');
 view.message='Review this range';view.addComment(cx);
 assert.match(view.reviewMessage(),/one.txt:10-11 \(new\)/);
 assert.match(view.comments[1].snippet,/new first\n\+new last/);
 view.selectLine(1,false,cx);view.selectLine(4,true,cx);
 assert.equal(view.anchor.side,'old');assert.equal(view.anchor.endSide,'new');
 assert.match(view.commentLocation({file:'one.txt',...view.anchor}),/10 \(old\).*11 \(new\)/);
 view.rows=actualRows;view.anchor=null;
 delivery={code:9,stdout:'',stderr:'Recipient blocked'};view.sendReview(cx);await drain();assert.equal(view.comments.length,2);assert.ok(!calls[0].includes('--force'));
 delivery={code:0,stdout:'{}',stderr:''};view.sendReview(cx);await drain();assert.equal(view.comments.length,0);assert.equal(calls[1][1],'t-plan');
 agent.tab_name='Implementer';view.selectedAgent=null;await view.findRecipients(view.context);assert.equal(view.planners.length,0);assert.equal(view.selectedAgent,null);
 view.message='Choose recipient';view.addComment(cx);const before=calls.length;view.sendReview(cx);await drain();assert.equal(calls.length,before);assert.equal(view.chooseAgent,true);
 console.log('Diff review checks passed: working tree, root/normal commit, line anchors, planner routing, blocked send retention, recipient selection');
 fs.rmSync(root,{recursive:true,force:true});
})().catch(e=>{console.error(e);process.exitCode=1;});
