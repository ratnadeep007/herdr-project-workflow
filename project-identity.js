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
