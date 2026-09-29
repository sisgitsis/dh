import { jsonResp, isLoggedIn, getKVData, saveKVData, batchCacheIcons } from "../_utils.js";

function normalizeData(input){
  const out = {categories:[], sites:[]};
  if(!input) return out;
  if(!Array.isArray(input) && Array.isArray(input.categories)){
    let cs = Date.now();
    const nameToId = {};
    for(const c of input.categories){
      if(!c) continue;
      const name = String(c.name||c.title||c.cat||"").trim();
      if(!name) continue;
      const cid = String(c.id || "c_"+(cs++));
      nameToId[name] = cid;
      if(c.id) nameToId[c.id] = cid;
      out.categories.push({id:cid, name, parentId:c.parentId??null, locked:!!c.locked});
    }
    if(Array.isArray(input.sites)){
      let ss = Date.now();
      for(const s of input.sites){
        if(!s) continue;
        const name = String(s.name||s.title||"").trim();
        const url = String(s.url||s.link||s.href||"").trim();
        if(!name || !url) continue;
        let catId = s.catId ?? "";
        if(s.catName && nameToId[s.catName]) catId = nameToId[s.catName];
        if(s.category && nameToId[s.category]) catId = nameToId[s.category];
        out.sites.push({
          id: String(s.id ?? "s_"+(ss++)),
          name,url,
          icon:s.icon??"",
          iconText:s.iconText??"",
          iconColor:s.iconColor??"",
          size:s.size??"1x1",
          catId: catId ?? (out.categories[0]?.id ?? "")
        });
      }
    }
    return out;
  }
  if(Array.isArray(input)){
    let cs = Date.now(), ss = Date.now()+1;
    for(const g of input){
      if(!g) continue;
      const cid = "c_"+(cs++);
      out.categories.push({id:cid,name:String(g.name||g.title||g.cat||"未分类").trim(),parentId:null,locked:false});
      const arr = Array.isArray(g.sites) ? g.sites : (Array.isArray(g.list)?g.list:[]);
      for(const s of arr){
        if(!s) continue;
        const name = String(s.name||s.title||"").trim();
        const url = String(s.url||s.link||s.href||"").trim();
        if(!name||!url) continue;
        out.sites.push({
          id:"s_"+(ss++),name,url,
          icon:s.icon??"",iconText:s.iconText??"",iconColor:s.iconColor??"",
          size:"1x1",catId:cid
        });
      }
    }
    return out;
  }
  return out;
}

function mergeData(cur, add){
  const cidSet = new Set(cur.categories.map(x=>x.id));
  for(const c of add.categories){
    if(!cidSet.has(c.id)){
      cur.categories.push(c);
      cidSet.add(c.id);
    }
  }
  const sidSet = new Set(cur.sites.map(x=>x.id));
  for(const s of add.sites){
    if(!cidSet.has(s.catId)) s.catId = cur.categories[0]?.id ?? "";
    if(sidSet.has(s.id)) s.id = s.id + "_"+Date.now();
    cur.sites.push(s);
    sidSet.add(s.id);
  }
  return cur;
}

export async function onRequestPost(context) {
  const {request, env} = context;
  if(!(await isLoggedIn(request, env))){
    return jsonResp({ok:false, error:"Unauthorized"},401);
  }
  try{
    const body = await request.json();
    const normalized = normalizeData(body);
    if(!normalized.categories.length && !normalized.sites.length){
      return jsonResp({ok:false, error:"未解析到有效数据"},400);
    }
    const current = await getKVData(env);
    const merged = mergeData(current, normalized);
    merged.sites = await batchCacheIcons(env, merged.sites);
    await saveKVData(env, merged);
    return jsonResp({
      ok:true,
      addedCategories:normalized.categories.length,
      addedSites:normalized.sites.length,
      totalCategories:merged.categories.length,
      totalSites:merged.sites.length
    });
  }catch(e){
    return jsonResp({ok:false, error:"请求体不是合法JSON"},400);
  }
}

export async function onRequestGet(){
  return jsonResp({ok:false, error:"Method Not Allowed"},405);
}
