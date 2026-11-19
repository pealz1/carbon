import {account} from "$lib/account.svelte";
import {musicRequest} from "$lib/carbon-account";
import {carbonPlaylists} from "$lib/local/playlists.svelte";
import type {CarbonPlaylist,PlaylistItem} from "$lib/local/api";
import {songOf,trackOf,type Song} from "./song";

export interface Summary {id:string;name:string;shareId:string;revision:number;count:number;visible:boolean}
export interface Profile {shareId:string;name:string;bio:string;visible:boolean}
export interface Library {profile:Profile|null;playlists:Summary[];following:Pick<Profile,"shareId"|"name">[]}
export interface OnlinePlaylist extends Summary {songs:(Omit<Song,"image">&{explicit:boolean})[]}
export interface PublicProfile extends Profile {playlists:Summary[]}
export const readLibrary=()=>account.music<Library>("/me/library");
const uuid=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function sharedKey(input:string):{type:"people"|"shared";key:string}|null{
  try{
    const url=new URL(input);
    if(url.origin!=="https://getcarbon.cc" || url.pathname.replace(/\/$/,"")!=="/music")return null;
    for(const type of ["people","shared"] as const){const key=url.searchParams.get(type);if(key && uuid.test(key))return {type,key};}
  }catch{}
  return null;
}
export const shareUrl=(type:"people"|"shared",key:string)=>"https://getcarbon.cc/music?"+new URLSearchParams({[type]:key});
export const readShare=(key:string)=>musicRequest<OnlinePlaylist>("/shared/"+key);
export const readPerson=(key:string)=>musicRequest<PublicProfile>("/people/"+key);
export function cloudItems(list:OnlinePlaylist):PlaylistItem[]{
  return list.songs.map(s=>({kind:s.uri.startsWith("ytm:")?"youtube":"spotify",track:{...trackOf({...s,image:null}),explicit:s.explicit}}));
}
function keyFor(id:string){if(!account.user)throw Error("Refresh your Carbon sign-in before syncing.");return "music-revision:"+account.user.id+":"+id;}
export function remember(id:string,revision:number){localStorage.setItem(keyFor(id),String(revision));}
export async function upload(list:CarbonPlaylist,visible:boolean){
  if(list.items.some(i=>i.kind==="local"))throw Error("This playlist includes device-only files. Choose a playlist of Spotify or YouTube songs.");
  const songs=list.items.flatMap(i=>{
    if(i.kind==="local")return [];
    const {image,...song}=songOf(i.track);
    return [{...song,explicit:i.track.explicit}];
  });
  const expected=Number(localStorage.getItem(keyFor(list.id)) || 0);
  const saved=await account.music<{revision:number}>("/me/playlists/"+list.id,{method:"POST",body:JSON.stringify({name:list.name,visible,expected,songs})});
  remember(list.id,saved.revision);
}
export async function restore(list:OnlinePlaylist,expected:number|null){
 if(!await carbonPlaylists.restore(list.id,list.name,cloudItems(list),expected))throw Error(carbonPlaylists.error || "Restore failed.");
 remember(list.id,list.revision);
}
