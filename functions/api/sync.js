import { jsonResp, storageGet, storagePut } from "../_utils.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const b = await request.json();
    const id = String(b.id ?? "");
    if (!/^\d{6,9}$/.test(id)) {
      return jsonResp({ ok: false, error: "ID格式错误" }, 400);
    }
    if (!b.data || !Array.isArray(b.data.categories) || !Array.isArray(b.data.sites)) {
      return jsonResp({ ok: false, error: "数据格式错误" }, 400);
    }
    let pwd = "";
    if (b.pwd) {
      pwd = String(b.pwd);
      if (!/^[\x21-\x7e]{6,10}$/.test(pwd)) {
        return jsonResp({ ok: false, error: "密码需为6‑10位" }, 400);
      }
    }
    await storagePut(env, "sync_" + id, JSON.stringify({ data: b.data, pwd, ts: Date.now() }));
    return jsonResp({ ok: true });
  } catch (e) {
    return jsonResp({ ok: false, error: "Invalid JSON" }, 400);
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") ?? "");
  if (!/^\d{6,9}$/.test(id)) {
    return jsonResp({ ok: false, error: "ID格式错误" }, 400);
  }
  const raw = await storageGet(env, "sync_" + id);
  if (!raw) return jsonResp({ ok: false, error: "未找到该ID的同步数据" }, 404);
  const rec = JSON.parse(raw);
  if (rec.pwd) {
    const p = String(url.searchParams.get("pwd") ?? "");
    if (p !== rec.pwd) {
      return jsonResp({ ok: false, error: p ? "密码错误" : "该ID设有密码，请输入密码", needPwd: true }, 403);
    }
  }
  return jsonResp({ ok: true, data: rec.data, ts: rec.ts });
}
