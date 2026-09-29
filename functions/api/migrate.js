import { jsonResp, isLoggedIn, d1ok } from "../_utils.js";

async function readAllFrom(env, src) {
  const out = [];
  if(src === "kv" && env.NAV_STORE){
    const list = await env.NAV_STORE.list();
    for(const k of list.keys){
      const v = await env.NAV_STORE.get(k.name);
      if(v !== null) out.push([k.name, v]);
    }
  }else if(src === "d1" && await d1ok(env)){
    const res = await env.NAV_DB.prepare("SELECT key,value FROM kv_store").all();
    for(const x of res.results){
      out.push([x.key, x.value]);
    }
  }else if(src === "r2" && env.NAV_BUCKET){
    const list = await env.NAV_BUCKET.list();
    for(const obj of list.objects){
      const o = await env.NAV_BUCKET.get(obj.key);
      if(o){
        const text = await o.text();
        out.push([obj.key, text]);
      }
    }
  }
  return out;
}

async function writeOneTo(env, dst, k, v){
  if(dst === "kv" && env.NAV_STORE){
    await env.NAV_STORE.put(k, v);
    return true;
  }
  if(dst === "d1" && await d1ok(env)){
    await env.NAV_DB.prepare(`
INSERT INTO kv_store(key,value) VALUES(?,?)
ON CONFLICT(key) DO UPDATE SET value=excluded.value
`).bind(k, v).run();
    return true;
  }
  if(dst === "r2" && env.NAV_BUCKET){
    await env.NAV_BUCKET.put(k, v);
    return true;
  }
  return false;
}

export async function onRequestPost(context) {
  const {request, env} = context;
  if(!(await isLoggedIn(request, env))){
    return jsonResp({ok:false, error:"Unauthorized"},401);
  }
  try{
    const body = await request.json();
    const src = String(body.src ?? "");
    const dst = String(body.dst ?? "");
    const names = {kv:"KV",d1:"D1",r2:"R2"};
    if(!names[src] || !names[dst] || src === dst){
      return jsonResp({ok:false, error:"迁移方向不正确"},400);
    }
    let srcOk = false;
    if(src === "kv") srcOk = !!env.NAV_STORE;
    else if(src === "d1") srcOk = await d1ok(env);
    else if(src === "r2") srcOk = !!env.NAV_BUCKET;

    let dstOk = false;
    if(dst === "kv") dstOk = !!env.NAV_STORE;
    else if(dst === "d1") dstOk = await d1ok(env);
    else if(dst === "r2") dstOk = !!env.NAV_BUCKET;

    if(!srcOk || !dstOk){
      return jsonResp({ok:false, error:"源和目标存储都需要绑定"},400);
    }
    const rows = await readAllFrom(env, src);
    let count = 0;
    for(const [k,v] of rows){
      if(await writeOneTo(env, dst, k, v)) count++;
    }
    return jsonResp({ok:true, msg:`已将 ${count} 条数据从 ${names[src]} 迁移到 ${names[dst]}`});
  }catch(e){
    return jsonResp({ok:false, error:"迁移失败："+e.message},500);
  }
}

export async function onRequestGet(){
  return jsonResp({ok:false, error:"Method Not Allowed"},405);
}
