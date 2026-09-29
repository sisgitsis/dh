import { jsonResp, getTgCfg } from "../_utils.js";

async function tgSend(env, chatId, text){
  const cfg = await getTgCfg(env);
  if(!cfg.token || !chatId) return false;
  try{
    const res = await fetch(`https://api.telegram.org/bot${cfg.token}/sendMessage`,{
      method:"POST",
      headers:{"Content‑Type":"application/json"},
      body:JSON.stringify({chat_id:chatId, text})
    });
    const j = await res.json();
    return !!j.ok;
  }catch(e){
    return false;
  }
}

export async function onRequestPost(context) {
  const {request, env} = context;
  if(request.method !== "POST") return jsonResp({ok:false, error:"Method Not Allowed"},405);
  try{
    const b = await request.json();
    const content = String(b.content??"").trim();
    if(!content || content.length>2000){
      return jsonResp({ok:false, error:"内容为空或过长"},400);
    }
    const cfg = await getTgCfg(env);
    if(!cfg.token || !cfg.adminChatId){
      return jsonResp({ok:false, error:"管理员未配置TG"},400);
    }
    const ok = await tgSend(env, cfg.adminChatId,
`📮 导航站问题反馈
设备ID: ${b.deviceId??"未知"}
时间: ${new Date().toLocaleString("zh‑CN",{timeZone:"Asia/Shanghai"})}
内容:
${content}`
    );
    return ok ? jsonResp({ok:true}) : jsonResp({ok:false, error:"推送失败"},500);
  }catch(e){
    return jsonResp({ok:false, error:"Invalid JSON"},400);
  }
}

export async function onRequestGet(){
  return jsonResp({ok:false, error:"Method Not Allowed"},405);
}
