(async()=>{
  const list=document.getElementById("carbon-installers");if(!list)return;
  try{
    const r=await fetch("https://api.github.com/repos/pealz1/carbon/releases/latest",{credentials:"omit"});if(!r.ok)return;
    const release=await r.json();const anchors=[];
    for(const a of release.assets){
      if(!a.browser_download_url?.startsWith("https://github.com/pealz1/carbon/releases/download/"))continue;
      const n=a.name.toLowerCase(),arm=/arm64|aarch64/.test(n);
      let label="";
      if(n.endsWith(".dmg"))label="macOS · "+(n.includes("universal")?"Universal":arm?"Apple silicon":"Intel")+" · DMG";
      else if(n.endsWith(".exe"))label="Windows · x64 · Installer";
      else if(/\.(appimage|deb|rpm)$/.test(n))label="Linux · "+(arm?"ARM64":"Intel / AMD 64-bit")+" · "+n.split(".").at(-1).toUpperCase();
      if(label){const li=document.createElement("li"),link=document.createElement("a");link.href=a.browser_download_url;link.textContent=label;li.append(link);anchors.push(li);}
    }
    if(anchors.length)list.prepend(...anchors.sort((a,b)=>a.textContent.localeCompare(b.textContent)));
  }catch{}
})();
