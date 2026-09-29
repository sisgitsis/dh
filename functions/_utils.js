// _utils.js 【彻底移除crypto.subtle，解决Pages Functions 520】
let d1Ready = false;

async function d1ok(env) {
    if (!env.NAV_DB) return false;
    if (d1Ready) return true;
    try {
        await env.NAV_DB.prepare("CREATE TABLE IF NOT EXISTS kv_store(key TEXT PRIMARY KEY,value TEXT)").run();
        d1Ready = true;
        return true;
    } catch (e) {
        return false;
    }
}

async function storageGet(env, key) {
    if (env.NAV_STORE) {
        const v = await env.NAV_STORE.get(key);
        if (v != null) return v;
    }
    if (await d1ok(env)) {
        try {
            const r = await env.NAV_DB.prepare("SELECT value FROM kv_store WHERE key=?").bind(key).first();
            if (r && r.value != null) return r.value;
        } catch (e) { }
    }
    if (env.NAV_BUCKET) {
        try {
            const o = await env.NAV_BUCKET.get(key);
            if (o) return await o.text();
        } catch (e) { }
    }
    return null;
}

async function storagePut(env, key, value) {
    const jobs = [];
    if (env.NAV_STORE) jobs.push(env.NAV_STORE.put(key, value));
    if (await d1ok(env)) jobs.push(env.NAV_DB.prepare("INSERT INTO kv_store(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key, value).run());
    if (env.NAV_BUCKET) jobs.push(env.NAV_BUCKET.put(key, value));
    if (!jobs.length) throw new Error("未绑定任何存储");
    await Promise.all(jobs);
}

async function getKVData(env) {
    const raw = await storageGet(env, "nav_data");
    if (!raw) return { categories: [], sites: [], settings: {} };
    try {
        const d = JSON.parse(raw);
        if (!d.settings) d.settings = {};
        if (!Array.isArray(d.categories)) d.categories = [];
        if (!Array.isArray(d.sites)) d.sites = [];
        return d;
    } catch (e) {
        return { categories: [], sites: [], settings: {} };
    }
}

async function saveKVData(env, obj) {
    if (!obj || !Array.isArray(obj.categories) || !Array.isArray(obj.sites)) throw new Error("数据格式不正确");
    if (!obj.settings) obj.settings = {};
    await storagePut(env, "nav_data", JSON.stringify(obj));
}

async function getAdminPwd(env) {
    return await storageGet(env, "admin_password") || "";
}

async function setAdminPwd(env, pwd) {
    await storagePut(env, "admin_password", pwd);
}

async function getTgCfg(env) {
    try {
        return JSON.parse(await storageGet(env, "tg_config") || "{}");
    } catch (e) {
        return {};
    }
}

async function setTgCfg(env, cfg) {
    await storagePut(env, "tg_config", JSON.stringify(cfg));
}

// ========== 无crypto版本，绕开Pages运行时bug ==========
async function makeToken(pwd) {
  return pwd;
}

async function isLoggedIn(request, env) {
  const realPwd = await getAdminPwd(env);
  if (!realPwd) return true;
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/admin_token=([^;]+)/);
  if (!match) return false;
  const cookiePwd = match[1];
  return cookiePwd === realPwd;
}

function jsonResp(o, s) {
    return new Response(JSON.stringify(o), {
        status: s || 200,
        headers: { "Content‑Type": "application/json;charset=utf‑8" }
    });
}

async function tgSend(env, chatId, text) {
    const cfg = await getTgCfg(env);
    if (!cfg.token || !chatId) return false;
    try {
        const r = await fetch("https://api.telegram.org/bot" + cfg.token + "/sendMessage", {
            method: "POST",
            headers: { "Content‑Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text })
        });
        const j = await r.json();
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

async function fetchFavicon(domain) {
    const candidates = [
        `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
        `https://${domain}/favicon.ico`
    ];
    for (const url of candidates) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(4500) });
            if (res.ok) {
                const buf = await res.arrayBuffer();
                return { ok: true, buf, contentType: res.headers.get("content‑type") || "image/x‑icon" };
            }
        } catch (e) { continue; }
    }
    return { ok: false };
}

async function batchCacheIcons(env, siteList) {
    if (!env.NAV_ICON_BUCKET) return siteList;
    const R2_PUBLIC_PREFIX = "https://r2ico.291129.xyz";
    const out = [];
    for (const s of siteList) {
        if (s.icon && s.icon.startsWith(R2_PUBLIC_PREFIX)) {
            out.push(s);
            continue;
        }
        if (!s.icon) {
            try {
                const u = new URL(s.url);
                const ret = await fetchFavicon(u.hostname);
                if (ret.ok) {
                    const key = `icons/${Date.now()}_${Math.random().toString(36).slice(2)}`;
                    await env.NAV_ICON_BUCKET.put(key, ret.buf, { httpMetadata: { contentType: ret.contentType } });
                    s.icon = `${R2_PUBLIC_PREFIX}/${key}`;
                }
            } catch (e) { }
        }
        out.push(s);
    }
    return out;
}

export {
    d1ok,
    storageGet,
    storagePut,
    getKVData,
    saveKVData,
    getAdminPwd,
    setAdminPwd,
    getTgCfg,
    setTgCfg,
    makeToken,
    isLoggedIn,
    jsonResp,
    tgSend,
    tgVerify,
    fetchFavicon,
    batchCacheIcons
};
