import {expect,it} from "vitest";
import {dailyMixes} from "./mixes";
import type {Entry} from "./entries";
it("rotates on a local day and never mixes services or duplicates tracks",()=>{
  const t=(i:number,service="local"):Entry=>({at:i,source:service,title:String(i),uri:service+":"+i,artists:["Artist "+(i%6)],album:"",durationMs:50,image:null});
  const rows=[...Array.from({length:38},(_,i)=>t(i)),t(1),t(2,"spotify")],now=new Date(2026,10,1,12).getTime();
  const a=dailyMixes(rows,now);
  expect(a).toEqual(dailyMixes(rows,now+1000));expect(a[0].tracks).toHaveLength(30);
  expect(new Set(a[0].tracks.map(e=>e.uri)).size).toBe(30);expect(new Set(a[0].tracks.slice(0,6).map(e=>e.artists[0])).size).toBe(6);
  expect(a[1].tracks).toHaveLength(1);expect(a).not.toEqual(dailyMixes(rows,now+86400000));
});
