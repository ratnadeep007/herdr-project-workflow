const fs=require('fs'),assert=require('assert/strict');
const source=fs.readFileSync(`${__dirname}/project-diff/main.js`,'utf8').replace(/^import .*;\n/gm,'').replace('export default class Changes','class Changes');
const storage=new Map();let notifications=0;
const {treeRows,Changes}=new Function('View','localStorage',source+';return {treeRows,Changes};')(
 class{}, {getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)});
const files=[
 {path:'src/components/forms/input.js',status:'M',add:3,del:1},
 {path:'src/components/button.js',status:'A',add:2,del:0},
 {path:'src/index.js',status:'M',add:1,del:1},
 {path:'src-old/index.js',status:'D',add:0,del:3},
 {path:'README.md',status:'M',add:1,del:0},
];
const original=JSON.stringify(files),all=treeRows(files);
assert.equal(all.filter(row=>row.folder&&row.path==='src').length,1);
assert.equal(all.filter(row=>!row.folder).length,files.length);
const collapsed=treeRows(files,new Set(['src']));
assert.ok(collapsed.some(row=>row.folder&&row.path==='src'&&row.collapsed));
assert.ok(!collapsed.some(row=>row.path.startsWith('src/')));
assert.ok(collapsed.some(row=>row.path==='src-old/index.js'),'folder boundaries must not hide similarly named siblings');
assert.ok(collapsed.some(row=>row.path==='README.md'));
const nested=treeRows(files,new Set(['src/components']));
assert.ok(nested.some(row=>row.path==='src/index.js'));
assert.ok(!nested.some(row=>row.path.startsWith('src/components/')));
assert.equal(JSON.stringify(files),original,'tree folding must not mutate Git file data');
const view=new Changes();view.context='project-a';view.collapsedFolders=new Set();view.open='src/components/button.js';view.comments=[{message:'Keep draft'}];
const cx={notify(){notifications++;}};
view.toggleFolder('src/components',cx);view.toggleFolder('src',cx);view.toggleFolder('src',cx);
assert.deepEqual([...view.collapsedFolders],['src/components'],'reopening a parent preserves nested fold state');
assert.deepEqual(JSON.parse(storage.get('diff.folders:project-a')),['src/components']);
assert.equal(view.open,'src/components/button.js');assert.equal(view.comments[0].message,'Keep draft');
view.context='project-b';view.collapsedFolders=new Set();view.toggleFolder('other',cx);
assert.deepEqual(JSON.parse(storage.get('diff.folders:project-a')),['src/components'],'fold preferences are isolated by project context');
assert.equal(notifications,4);
console.log('Diff tree checks passed: parent/nested collapse, sibling boundaries, fold persistence, file selection and comment retention');
