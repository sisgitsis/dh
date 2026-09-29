// 完全不导入任何utils
export async function onRequestGet() {
  return new Response(JSON.stringify({ok:true,msg:"dummy ok"}),{headers:{"Content‑Type":"application/json"}});
}
