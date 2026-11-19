(async()=>{
  const params=new URLSearchParams(location.search),kind=params.has("people")?"people":"shared",key=params.get(kind);
  const detail=document.getElementById("detail");
  if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(key??"")){detail.textContent="This sharing link is invalid.";return;}
  try {
    const result=await fetch("https://api.getcarbon.cc/v1/library/"+kind+"/"+key,{credentials:"omit"});
    if(!result.ok)throw Error(result.status===404?"This item is private or unavailable.":"Carbon could not load this link.");
    const data=await result.json();document.getElementById("name").textContent=data.name;
    detail.textContent=kind==="people"?data.bio:data.count+" songs";
    const list=document.getElementById("tracks");
    if(kind==="people")for(const p of data.playlists){const a=document.createElement("a"),li=document.createElement("li");a.href="/music?"+new URLSearchParams({shared:p.shareId});a.textContent=p.name;li.append(a);list.append(li);}
    else for(const song of data.songs){const li=document.createElement("li");li.textContent=[song.title,song.artists.join(", ")].filter(Boolean).join(" · ");list.append(li);}
    const open=document.getElementById("open");open.href="carbon://music/"+kind+"/"+key;open.hidden=false;
  } catch(e){detail.textContent=e.message;}
})();
