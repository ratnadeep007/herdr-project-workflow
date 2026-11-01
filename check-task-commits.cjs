const fs=require('fs'),assert=require('assert/strict');
const source=fs.readFileSync(`${__dirname}/project-hub/main.js`,'utf8').replace(/^import .*;\n/gm,'').replace('export default class ProjectHub','class ProjectHub');
let saved=null;
const env={View:class{},spaces:()=>[{id:'s',machine:null,active:true}],props:()=>({cwd:'/repo'}),
 writeTextFile:async(path,text,expected)=>{saved={path,text,expected};}};
const {parse,Hub}=new Function('env',`const {${Object.keys(env).join(',')}}=env;${source};return {parse,Hub:ProjectHub};`)(env);
const text=[
 '# Tasks',
 '- [ ] T1 — Validate email <!-- herdr:{"state":"doing","agent":"t3"} -->',
 '  - [x] Implement validation',
 '  - [ ] Test invalid input',
 '    - [ ] Verify feedback',
 '  Acceptance: invalid input prevents submission.',
 '  Commit: feat: validate email (T1)',
 '  ```markdown',
 '  - [ ] Fenced example, not a subtask',
 '  ```',
 '- [x] T2 — Add empty state <!-- herdr:{"state":"review","agent":null} -->',
 '  - [x] Implement and test empty state',
 '## Notes',
 '  - [ ] Unattached nested example',
 '```markdown',
 '- [ ] Fenced parent example',
 '```',
 '3. [ ] T3 — Save profile name',
 '  1. [x] Persist name',
 '  2. [x] Test reload',
].join('\n');
const tasks=parse(text);
assert.equal(tasks.length,3,'only parent checklists become cards');
assert.equal(tasks[0].state,'doing');assert.equal(tasks[0].agent,'t3');
assert.deepEqual(tasks[0].subtasks.map(t=>t.checked),[true,false,false]);
assert.equal(tasks[1].state,'done','checked parent overrides metadata');
assert.equal(tasks[1].subtasks.length,1,'headings end subtask attachment');
assert.equal(tasks[2].state,'todo','finished subtasks do not auto-complete parent');
assert.equal(tasks[2].subtasks.length,2);
const example=parse(fs.readFileSync(`${__dirname}/examples/tasks.md`,'utf8'));
assert.equal(example.length,5);assert.ok(example.every(t=>t.subtasks.length>=3));
(async()=>{
 const hub=new Hub();hub.text=text;hub.context=JSON.stringify([null,'/repo']);hub.path='/repo/tasks.md';hub.project=()=>'/repo';hub.refresh=()=>{};
 let job;const cx={notify(){},spawn(fn){job=fn(this);}};
 hub.update(tasks[0],{state:'review',agent:'t7'},cx);await job;
 assert.equal(saved.expected,text);
 const before=text.split('\n'),after=saved.text.split('\n');
 assert.match(after[1],/"state":"review","agent":"t7"/);
 assert.deepEqual(after.slice(2),before.slice(2),'moving parent preserves every subtask and acceptance/commit line');
 assert.equal(parse(saved.text).length,3);
 console.log('Commit-sized task checks passed: nested subtasks, fences, progress, parent state and lossless parent updates');
})().catch(error=>{console.error(error);process.exitCode=1;});
