const fs=require('fs'),assert=require('assert/strict'),os=require('os'),path=require('path'),{spawnSync}=require('child_process');
const base=__dirname,helper=fs.readFileSync(path.join(base,'project-identity.js'),'utf8');
const {projectIdentity,projectIdentityKey}=new Function('shared',helper+';return {projectIdentity,projectIdentityKey};')(()=>({}));
const one=projectIdentity('/work/client-alpha',null),two=projectIdentity('/work/client-beta',null);
assert.equal(one.initials,'CA');assert.equal(two.initials,'CB');
assert.deepEqual(projectIdentity('/work/client-alpha',null),one);
assert.notEqual(projectIdentityKey('/a/api',null),projectIdentityKey('/b/api',null));
assert.notEqual(projectIdentityKey('/a/api','remote'),projectIdentityKey('/a/api',null));
const overrides={[one.key]:{emoji:'🚀'}};
assert.equal(projectIdentity('/work/client-alpha',null,overrides).emoji,'🚀');
assert.equal(projectIdentity('/work/client-alpha','remote',overrides).emoji,undefined);
for(const mod of ['project-hub','project-diff','project-tabs','project-icon']) {
 const source=fs.readFileSync(path.join(base,mod,'main.js'),'utf8');
 assert.equal(source.split('// PROJECT_IDENTITY_BEGIN\n')[1].split('// PROJECT_IDENTITY_END')[0],helper,mod+' helper drift');
}
function constant(file,name){const s=fs.readFileSync(path.join(base,file,'main.js'),'utf8');return new Function(s.match(new RegExp('const '+name+' =?\\s*`[\\s\\S]*?`;'))[0]+'return '+name+';')();}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'herdr-identity-'));
try {
 const project=path.join(root,'project');fs.mkdirSync(project);
 fs.writeFileSync(path.join(project,'package.json'),JSON.stringify({dependencies:{react:'*'}}));
 fs.writeFileSync(path.join(project,'pyproject.toml'),'[project]');
 const probe=spawnSync('python3',['-c',constant('project-hub','PROJECT_STACK_PROBE'),project],{encoding:'utf8'});
 assert.equal(probe.status,0,probe.stderr);assert.deepEqual(JSON.parse(probe.stdout),['React','Node.js','Python']);
 const logo=path.join(root,"logo's $(literal).png");
 fs.writeFileSync(logo,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=','base64'));
 const script=constant('project-icon','PROJECT_ICON_IMPORT');
 const imported=spawnSync('python3',['-c',script,logo,root],{encoding:'utf8'});
 assert.equal(imported.status,0,imported.stderr);
 const target=path.join(root,JSON.parse(imported.stdout).image);
 assert.deepEqual(fs.readFileSync(target),fs.readFileSync(logo));
 fs.unlinkSync(logo);assert.ok(fs.existsSync(target),'original file may move');
 const bad=path.join(root,'bad.png');fs.writeFileSync(bad,'not an image');
 assert.notEqual(spawnSync('python3',['-c',script,bad,root]).status,0);
 fs.writeFileSync(bad,Buffer.alloc(5*1024*1024+1));
 assert.notEqual(spawnSync('python3',['-c',script,bad,root]).status,0);
 console.log('Project identity checks passed: stable identities, machine isolation, shared surfaces, stack detection, image import and invalid-image rejection');
} finally {fs.rmSync(root,{recursive:true,force:true});}

async function checkPicker() {
 let saved={unrelated:{emoji:'🧪'}};let closed=0;
 const source=fs.readFileSync(path.join(base,'project-icon/main.js'),'utf8').replace(/^import .*;\n/gm,'').replace('export default class ProjectIcon','class ProjectIcon');
 const Picker=new Function('View','props','shared','setShared','closeOverlay',source+';return ProjectIcon;')(
  class{},()=>({root:'/a/api',on:null,overlay:'preview'}),()=>saved,(_key,value)=>{saved=value;},()=>{closed++;});
 const picker=new Picker();picker.mode='Emoji';picker.emoji='🚀';picker.busy=false;
 let pending;const cx={notify(){},spawn(fn){pending=fn(this);}};
 picker.save(cx);await pending;
 const key=projectIdentityKey('/a/api',null);
 assert.equal(saved[key].emoji,'🚀');assert.equal(saved.unrelated.emoji,'🧪');assert.equal(closed,1);
 picker.busy=false;picker.emoji='';picker.save(cx);await pending;
 assert.equal(saved[key].emoji,'🚀');assert.ok(picker.error);assert.equal(closed,1);
 picker.busy=false;picker.save(cx,true);await pending;
 assert.equal(saved[key],undefined);assert.equal(saved.unrelated.emoji,'🧪');assert.equal(closed,2);
 console.log('Icon picker checks passed: save, invalid input retention, reset and unrelated-project preservation');
}
checkPicker().catch(error=>{console.error(error);process.exitCode=1;});
