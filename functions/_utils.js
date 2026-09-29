// _utils.js 【已移除 node:crypto import，兼容 Cloudflare Pages Functions】

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

// 【重要】使用 Workers 全局 Web Crypto，不导入任何 node:crypto
async function makeToken(pwd) {
    const encoder = new TextEncoder();
    const data = encoder.encode("nav_token_salt_v1:" + pwd);
    const hashBuf = await crypto.subtle.digest("SHA‑256", data);
    return Array.from(new Uint8Array(hashBuf))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

async function isLoggedIn(request, env) {
    const pwd = await getAdminPwd(env);
    if (!pwd) return false;
    const cookie = request.headers.get("cookie") || "";
    const expectToken = await makeToken(pwd);
    return cookie.includes("admin_token=" + expectToken);
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
    tgVerify
};
