export const languages={en:"English",de:"Deutsch",es:"Español",fr:"Français",id:"Bahasa Indonesia",it:"Italiano",pl:"Polski",pt:"Português",ru:"Русский",tr:"Türkçe",uk:"Українська"};
export type Locale=keyof typeof languages;
const files=import.meta.glob<Record<string,string>>("./catalogs/*.json",{import:"default"});
let dictionary=$state.raw<Record<string,string>>({}), current=$state<Locale>("en"), requested=0;
export const t=(source:string):string=>dictionary[source]??source;
export const activeLocale=():Locale=>current;
export async function selectLocale(code:Locale,save=true){
  if(!Object.hasOwn(languages,code))return;
  const sequence=++requested;
  const data=code==="en"?{}:await files["./catalogs/"+code+".json"]();
  if(sequence!==requested)return;
  dictionary=data;current=code;document.documentElement.lang=code;
  if(save)localStorage.setItem("carbon-language",code);
}
export function initLocale(){
  const saved=localStorage.getItem("carbon-language") || navigator.language.split("-")[0];
  return selectLocale(Object.hasOwn(languages,saved)?saved as Locale:"en",false);
}
