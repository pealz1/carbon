// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { parseProviderLink, embedUrl } from "./catalog";
import { appleExport, matchSongs, rank, readTrackFile } from "./import";
import type { Track } from "$lib/spotify/types";
const song={title:"São Paulo",artist:"Ana",durationMs:120000};
const track:Track={id:"abcdefghijk",uri:"ytm:video:abcdefghijk",name:"Sao Paulo",artists:[{id:"a",name:"Ana",uri:""}],album:null,durationMs:120050,explicit:false};
describe("playlist transfer",()=>{
  it("recognizes all catalogs and retains the storefront",()=>{
    for(const [url,source] of [
      ["https://open.spotify.com/playlist/1234567890123456789012","spotify"],["https://music.youtube.com/playlist?list=PL01","youtube"],
      ["https://music.apple.com/br/album/example/123?i=456","apple"],["https://www.deezer.com/fr/playlist/42","deezer"],
      ["https://soundcloud.com/forss/sets/live","soundcloud"],["https://www.mixcloud.com/example/playlists/shows/","mixcloud"],
      ["https://archive.org/details/recording","archive"]]){
      const link=parseProviderLink(url)!;expect(link.source).toBe(source);expect(new URL(embedUrl(link)).protocol).toBe("https:");
    }
    expect(parseProviderLink("https://music.apple.com/br/album/example/123?i=456")).toMatchObject({country:"br",kind:"track",id:"456"});
    for(const bad of ["https://music.apple.com.example.org/album/123","https://x@deezer.com/playlist/123","http://soundcloud.com/a/b"])expect(parseProviderLink(bad)).toBeNull();
  });
  it("imports quoted CSV, Apple tab text and extended M3U",()=>{
    expect(readTrackFile('Track Name,Artist Name(s),Duration (ms)\r\n"Two, Three","A ""B""",60001')[0]).toEqual({title:"Two, Three",artist:'A "B"',durationMs:60001});
    expect(readTrackFile("\uFEFFName\tArtist\tTime\nSong\tArtist\t3:10")[0].durationMs).toBe(190000);
    expect(readTrackFile("#EXTM3U\n#EXTINF:59,A - B\nfile.mp3")[0]).toEqual({artist:"A",title:"B",durationMs:59000});
  });
  it("honors Apple playlist order including repeated tracks",()=>{
    const xml="<plist><dict><key>Tracks</key><dict><key>7</key><dict><key>Name</key><string>Four</string></dict></dict><key>Playlists</key><array><dict><key>Name</key><string>Set</string><key>Playlist Items</key><array>"+("<dict><key>Track ID</key><integer>7</integer></dict>").repeat(2)+"</array></dict></array></dict></plist>";
    const [list]=appleExport(xml);expect(list.title).toBe("Set");expect(list.songs.map(s=>s.title)).toEqual(["Four","Four"]);
  });
  it("requires explicit choices for uncertain matches and reuses identical searches",async()=>{
    expect(rank(song,[track]).selected?.id).toBe(track.id);
    expect(rank(song,[track,{...track,id:"z"}]).selected).toBeNull();
    expect(rank(song,[{...track,durationMs:240000}]).selected).toBeNull();
    const search=vi.fn().mockResolvedValue([track]),controller=new AbortController();
    expect(await matchSongs([song,song],controller.signal,()=>{},search)).toHaveLength(2);expect(search).toHaveBeenCalledTimes(1);
    controller.abort();await expect(matchSongs([song],controller.signal,()=>{},search)).rejects.toBeTruthy();
  });
});
