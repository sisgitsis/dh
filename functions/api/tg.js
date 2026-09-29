import { jsonResp, getTgCfg, setTgCfg, storageGet, storagePut } from "../_utils.js";

async function tgSend(env, chatId, text) {
  const cfg = await getTgCfg(env);
  if (!cfg.token || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
      method: "POST",
      headers: { "Content‑Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text })
    });
    const j = await res.json();
    return !!j.ok;
  } catch (e) {
    return false;
  }
}

async function tgVerify(env, role, code) {
  const raw = await storageGet(env, "tgcode_" + role);
  if (!raw || !code) return false;
  const rec = JSON.parse(raw);
  if (Date.now() - rec.ts > 300000) return false;
  return String(code) === rec.code;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const b = await request.json();
    const cfg = await getTgCfg(env);

    if (b.action === "status") {
      return jsonResp({
        ok: true,
        bound: !!(cfg.token && cfg.adminChatId),
        userBound: !!cfg.userChatId
      });
    }
    if (b.action === "save") {
      cfg.token = String(b.token || "");
      cfg.adminChatId = String(b.adminChatId || "");
      cfg.userChatId = String(b.userChatId || "");
      await setTgCfg(env, cfg);
      return jsonResp({ ok: true });
    }
    if (!cfg.token) {
      return jsonResp({ ok: false, error: "未配置TG机器人" }, 400);
    }
    if (b.action === "send") {
      const role = b.role === "user" ? "user" : "admin";
      const chatId = role === "user" ? cfg.userChatId : cfg.adminChatId;
      if (!chatId) return jsonResp({ ok: false, error: "未绑定chat_id" }, 400);
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await storagePut(env, "tgcode_" + role, JSON.stringify({ code, ts: Date.now() }));
      const ok = await tgSend(env, chatId, "🔑 导航站验证码：" + code + "（5分钟内有效）");
      return ok ? jsonResp({ ok: true }) : jsonResp({ ok: false, error: "发送失败" }, 500);
    }
    if (b.action === "verify") {
      const role = b.role === "user" ? "user" : "admin";
      const pass = await tgVerify(env, role, b.code);
      return jsonResp({ ok: pass });
    }
    return jsonResp({ ok: false, error: "未知操作" }, 400);
  } catch (e) {
    return jsonResp({ ok: false, error: "Invalid JSON" }, 400);
  }
}

export async function onRequestGet() {
  return jsonResp({ ok: false, error: "Method Not Allowed" }, 405);
}
