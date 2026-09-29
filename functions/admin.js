import { jsonResp, isLoggedIn, getAdminPwd, makeToken, getKVData, setAdminPwd, getTgCfg, setTgCfg } from "./_utils.js";

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // POST: 登录提交密码
  if (request.method === "POST") {
    const body = await request.json();
    const inputPwd = String(body.password || "");
    const realPwd = await getAdminPwd(env);

    if (!realPwd) {
      // 首次设置管理员密码
      await setAdminPwd(env, inputPwd);
    } else if (inputPwd !== realPwd) {
      return jsonResp({ ok: false, error: "密码错误" }, 403);
    }

    const token = await makeToken(inputPwd);
    return jsonResp({ ok: true }, 200, {
      "Set‑Cookie": `admin_token=${token}; Path=/; HttpOnly; Secure; SameSite=Strict`
    });
  }

  // GET 返回admin html页面
  const logged = await isLoggedIn(request, env);
  const html = `<!DOCTYPE html>
<html lang="zh‑CN">
<head>
<meta charset="UTF‑8">
<meta name="viewport" content="width=device‑width,initial‑scale=1.0">
<title>导航后台管理</title>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/font‑awesome@4.7.0/css/font‑awesome.min.css">
<script>tailwind.config={darkMode:'class'}</script>
<style>
body{background:#0f172a;color:#e2e8f0;min‑height:100vh;padding:2rem;}
.box{max‑width:640px;margin:0 auto;background:#1e293b;padding:24px;border‑radius:16px}
input,select,textarea{width:100%;padding:10px;border‑radius:8px;background:#334155;border:1px solid #475569;color:#fff;margin‑bottom:12px}
button{padding:8px 14px;border‑radius:8px;border:none;margin‑right:8px;margin‑bottom:8px}
.btn‑primary{background:#0284c7;color:white}
.btn‑danger{background:#dc2626;color:white}
.btn‑green{background:#059669;color:white}
.tip{font‑size:12px;opacity:0.7;margin‑bottom:10px}
</style>
</head>
<body class="dark">
<div class="box">
${!logged ? `
<h2 class="text‑xl font‑bold mb‑4">管理员登录</h2>
<div class="tip">首次访问请设置管理员密码</div>
<input id="pwdInput" type="password" placeholder="输入管理员密码">
<button class="btn‑primary" onclick="doLogin()">登录</button>
<div id="msg" class="mt‑3 text‑sm"></div>
<script>
async function doLogin(){
  const p=document.getElementById('pwdInput').value;
  const res=await fetch('/admin',{method:'POST',headers:{'Content‑Type':'application/json'},body:JSON.stringify({password:p})});
  const j=await res.json();
  if(j.ok){location.href='/admin';}else{document.getElementById('msg').innerText=j.error;document.getElementById('msg').style.color='#f87171';}
}
</script>
` : `
<h2 class="text‑xl font‑bold mb‑4">导航后台控制面板</h2>
<div class="tip">已登录 · <a href="/" style="color:#38bdf8">返回前台首页</a></div>
<h4 class="mt‑4 mb‑2">数据操作</h4>
<button class="btn‑green" onclick="rebuildAllIcons()">🔄一键重建全部图标R2缓存</button>
<div class="tip">将所有站点图标重新抓取存入R2，耗时视站点数量而定</div>
<div id="opMsg" class="my‑3 text‑sm"></div>
<script>
async function rebuildAllIcons(){
  const r=await fetch('/api/rebuildIcons',{method:'POST'});
  const j=await r.json();
  document.getElementById('opMsg').innerText=j.ok?"完成，处理"+j.total+"个站点":"失败:"+j.error;
  document.getElementById('opMsg').style.color=j.ok?"#86efac":"#f87171";
}
</script>
<h4 class="mt‑6 mb‑2">TG机器人配置</h4>
<div class="tip">用于反馈、验证码登录</div>
<input id="tgToken" placeholder="bot token">
<input id="tgAdminChatId" placeholder="管理员chat_id">
<input id="tgUserChatId" placeholder="普通用户chat_id">
<button class="btn‑primary" onclick="saveTg()">保存TG配置</button>
<script>
(async()=>{
  const res=await fetch('/api/tg',{method:'POST',body:JSON.stringify({action:'status'}),headers:{'Content‑Type':'application/json'}});
  const d=await res.json();
  document.getElementById('tgToken').value=d.token||'';
  document.getElementById('tgAdminChatId').value=d.adminChatId||'';
  document.getElementById('tgUserChatId').value=d.userChatId||'';
})();
async function saveTg(){
  await fetch('/api/tg',{method:'POST',headers:{'Content‑Type':'application/json'},body:JSON.stringify({action:'save',token:document.getElementById('tgToken').value,adminChatId:document.getElementById('tgAdminChatId').value,userChatId:document.getElementById('tgUserChatId').value})});
  alert('已保存');
}
</script>
<h4 class="mt‑6 mb‑2">存储迁移</h4>
<div class="tip">KV / D1 / R2之间迁移数据</div>
<select id="migrateSrc"><option value="kv">KV</option><option value="d1">D1</option><option value="r2">R2</option></select>
<select id="migrateDst"><option value="kv">KV</option><option value="d1">D1</option><option value="r2">R2</option></select>
<button class="btn‑primary" onclick="doMigrate()">执行迁移</button>
<script>
async function doMigrate(){
  const src=document.getElementById('migrateSrc').value;
  const dst=document.getElementById('migrateDst').value;
  const r=await fetch('/api/migrate',{method:'POST',headers:{'Content‑Type':'application/json'},body:JSON.stringify({src,dst})});
  const j=await r.json();
  alert(j.ok?j.msg:"错误:"+j.error);
}
</script>
`}
</div>
</body>
</html>
`;
  return new Response(html, { headers: { "Content‑Type": "text/html;charset=utf‑8" } });
}
