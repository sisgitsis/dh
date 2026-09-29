import { createHash } from "node:crypto";

// ========= R2图标缓存配置（你的R2自定义域名，不要修改） =========
export const R2_PUBLIC_PREFIX = "https://r2ico.291129.xyz/navicons/";

/**
 * 根据原始图标URL生成R2存储key
 * @param {string} originIconUrl
 * @returns {string} navicons/md5字符串
 */
export function getIconR2Key(originIconUrl) {
  const hash = createHash("md5").update(originIconUrl).digest("hex");
  return `navicons/${hash}`;
}

/**
 * 抓取图标并存入R2，失败返回原始链接做降级
 * @param {*} env pages function环境变量
 * @param {string} originIconUrl
 * @returns {Promise<string>}
 */
export async function cacheIconToR2(env, originIconUrl) {
  if (!originIconUrl || !/^https?:\/\//.test(originIconUrl)) {
    return originIconUrl;
  }
  const bucket = env.NAV_ICON_BUCKET;
  if (!bucket) return originIconUrl;

  const key = getIconR2Key(originIconUrl);
  const publicUrl = R2_PUBLIC_PREFIX + key.split("/").pop();

  // 判断对象是否已经存在R2，避免重复下载
  const existObj = await bucket.get(key);
  if (existObj) {
    return publicUrl;
  }

  try {
    const resp = await fetch(originIconUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (icon‑cacher for nav project)"
      },
      cf: { cacheTtl: 86400 }
    });
    if (!resp.ok) throw new Error(`http status ${resp.status}`);

    const blob = await resp.arrayBuffer();
    const contentType = resp.headers.get("content‑type") || "image/png";

    await bucket.put(key, blob, {
      httpMetadata: { contentType }
    });
    return publicUrl;
  } catch (err) {
    console.error("cacheIconToR2 error", originIconUrl, err.message);
    return originIconUrl;
  }
}

/**
 * 批量处理站点列表，把每个site.icon替换成R2缓存地址
 * @param {*} env
 * @param {Array} siteList
 * @returns {Promise<Array>}
 */
export async function batchCacheIcons(env, siteList) {
  const out = [];
  for (const site of siteList) {
    const newIcon = await cacheIconToR2(env, site.icon);
    out.push({ ...site, icon: newIcon });
  }
  return out;
}

// ====================== 存储层封装 storage 兼容 KV / D1 / R2 ======================
let d1Ready = false;

export async function d1ok(env) {
  if (!env.NAV_DB) return false;
  if (d1Ready) return true;
  try {
    await env.NAV_DB.prepare(`
CREATE TABLE IF NOT EXISTS kv_store(
  key TEXT PRIMARY KEY,
  value TEXT
)
`).run();
    d1Ready = true;
    return true;
  } catch (e) {
    return false;
  }
}

export async function storageGet(env, key) {
  if (env.NAV_STORE) {
    const v = await env.NAV_STORE.get(key);
    if (v !== null) return v;
  }
  if (await d1ok(env)) {
    try {
      const row = await env.NAV_DB.prepare("SELECT value FROM kv_store WHERE key=?").bind(key).first();
      if (row && row.value != null) return row.value;
    } catch (e) { /* */ }
  }
  if (env.NAV_BUCKET) {
    try {
      const obj = await env.NAV_BUCKET.get(key);
      if (obj) return await obj.text();
    } catch (e) { /* */ }
  }
  return null;
}

export async function storagePut(env, key, value) {
  const jobs = [];
  if (env.NAV_STORE) jobs.push(env.NAV_STORE.put(key, value));
  if (await d1ok(env)) {
    jobs.push(env.NAV_DB.prepare(`
INSERT INTO kv_store(key,value) VALUES(?,?)
ON CONFLICT(key) DO UPDATE SET value=excluded.value
`).bind(key, value).run());
  }
  if (env.NAV_BUCKET) jobs.push(env.NAV_BUCKET.put(key, value));
  if (!jobs.length) throw new Error("未绑定任何存储");
  await Promise.all(jobs);
}

// 获取导航主数据
export async function getKVData(env) {
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

export async function saveKVData(env, obj) {
  if (!obj || !Array.isArray(obj.categories) || !Array.isArray(obj.sites)) {
    throw new Error("数据格式不正确");
  }
  if (!obj.settings) obj.settings = {};
  await storagePut(env, "nav_data", JSON.stringify(obj));
}

// 管理员密码相关
export async function getAdminPwd(env) {
  return (await storageGet(env, "admin_password")) || "";
}
export async function setAdminPwd(env, pwd) {
  await storagePut(env, "admin_password", pwd);
}

// sha256 token生成，用于admin cookie鉴权
export async function makeToken(pwd) {
  const buf = await crypto.subtle.digest("SHA‑256", new TextEncoder().encode("nav_token_salt_v1:" + pwd));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function isLoggedIn(request, env) {
  const pwd = await getAdminPwd(env);
  if (!pwd) return false;
  const token = await makeToken(pwd);
  const cookie = request.headers.get("cookie") || "";
  return cookie.includes("admin_token=" + token);
}

// TG配置读写
export async function getTgCfg(env) {
  try {
    return JSON.parse((await storageGet(env, "tg_config")) || "{}");
  } catch (e) {
    return {};
  }
}
export async function setTgCfg(env, cfg) {
  await storagePut(env, "tg_config", JSON.stringify(cfg));
}

// JSON返回快捷工具
export function jsonResp(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content‑Type": "application/json;charset=utf‑8" }
  });
}
