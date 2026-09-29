import { jsonResp, isLoggedIn, storageGet, storagePut } from "../_utils.js";

const NAV_CATS = ["常用", "工具", "影音", "学习"];

function builtinNav(cat) {
  const all = {
    "常用": [
      { name: "百度", url: "https://www.baidu.com" },
      { name: "GitHub", url: "https://github.com" },
      { name: "哔哩哔哩", url: "https://www.bilibili.com" },
      { name: "知乎", url: "https://www.zhihu.com" },
      { name: "微博", url: "https://weibo.com" },
      { name: "淘宝", url: "https://www.taobao.com" }
    ],
    "工具": [
      { name: "在线PS", url: "https://www.photopea.com" },
      { name: "TinyPNG", url: "https://tinypng.com" },
      { name: "JSON格式化", url: "https://www.bejson.com" },
      { name: "翻译", url: "https://fanyi.baidu.com" }
    ],
    "影音": [
      { name: "YouTube", url: "https://www.youtube.com" },
      { name: "网易云音乐", url: "https://music.163.com" },
      { name: "腾讯视频", url: "https://v.qq.com" },
      { name: "爱奇艺", url: "https://www.iqiyi.com" }
    ],
    "学习": [
      { name: "MDN", url: "https://developer.mozilla.org" },
      { name: "菜鸟教程", url: "https://www.runoob.com" },
      { name: "掘金", url: "https://juejin.cn" },
      { name: "CSDN", url: "https://www.csdn.net" }
    ]
  };
  return (all[cat] || []).map(s => ({ name: s.name, url: s.url, icon: "", desc: "" }));
}

function normalizeNavItem(s) {
  return {
    name: s.name || s.title || s.sitename || "",
    url: s.url || s.link || s.site_url || "",
    icon: s.imgSrc || s.icon || s.src || s.logo || "",
    desc: s.description || s.desc || ""
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const cat = String(url.searchParams.get("cat") || "");

  if (cat === "__cats__") {
    const raw = await storageGet(env, "navstore_cats");
    const list = raw ? JSON.parse(raw) : NAV_CATS;
    return jsonResp({ ok: true, list });
  }

  const page = parseInt(url.searchParams.get("page") || "1");
  const rawApi = await storageGet(env, "navstore_api_" + cat);
  if (rawApi) {
    try {
      let apiUrl = rawApi;
      if (/[?&]page=\d*/.test(apiUrl)) {
        apiUrl = apiUrl.replace(/([?&]page=)\d*/, "$1" + page);
      } else {
        apiUrl += (apiUrl.includes("?") ? "&" : "?") + "page=" + page;
      }
      const r = await fetch(apiUrl, {
        headers: { "User‑Agent": "Mozilla/5.0", "Accept": "application/json" }
      });
      const j = await r.json();
      let arr = [];
      if (Array.isArray(j)) arr = j;
      else arr = j.data || j.list || j.result || j.items || j.sites || [];
      if (!Array.isArray(arr)) arr = [];
      const list = arr.map(s => normalizeNavItem(s)).filter(x => x.name);
      return jsonResp({
        ok: true, list, fromApi: true,
        page: j.page || page, pages: j.pages || 0, total: j.count || 0
      });
    } catch (e) { /* fall through */ }
  }

  const raw = await storageGet(env, "navstore_" + cat);
  const list = raw ? JSON.parse(raw) : builtinNav(cat);
  const start = (page - 1) * 24;
  return jsonResp({ ok: true, list: list.slice(start, start + 24), total: list.length });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!(await isLoggedIn(request, env))) {
    return jsonResp({ ok: false, error: "Unauthorized" }, 401);
  }
  let b;
  try {
    b = await request.json();
  } catch (e) {
    return jsonResp({ ok: false, error: "Invalid JSON" }, 400);
  }

  const catsRaw = await storageGet(env, "navstore_cats");
  let cats = catsRaw ? JSON.parse(catsRaw) : NAV_CATS;

  if (b.action === "addCat") {
    if (!cats.includes(b.cat)) cats.push(b.cat);
    await storagePut(env, "navstore_cats", JSON.stringify(cats));
    if (b.api) await storagePut(env, "navstore_api_" + b.cat, String(b.api));
    return jsonResp({ ok: true });
  }
  if (b.action === "delCat") {
    cats = cats.filter(c => c !== b.cat);
    await storagePut(env, "navstore_cats", JSON.stringify(cats));
    return jsonResp({ ok: true });
  }
  if (b.action === "save") {
    if (!Array.isArray(b.list)) return jsonResp({ ok: false, error: "list必须是数组" }, 400);
    await storagePut(env, "navstore_" + b.cat, JSON.stringify(b.list));
    return jsonResp({ ok: true });
  }
  if (b.action === "setApi") {
    await storagePut(env, "navstore_api_" + b.cat, b.api ? String(b.api) : "");
    return jsonResp({ ok: true });
  }
  if (b.action === "addItem") {
    const cat = String(b.cat || "");
    const raw = await storageGet(env, "navstore_" + cat);
    const list = raw ? JSON.parse(raw) : builtinNav(cat);
    list.unshift(b.item);
    await storagePut(env, "navstore_" + cat, JSON.stringify(list));
    return jsonResp({ ok: true });
  }
  if (b.action === "editItem") {
    const cat = String(b.cat || "");
    const raw = await storageGet(env, "navstore_" + cat);
    let list = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex((x, i) => i === b.index);
    if (idx >= 0) list[idx] = b.item;
    await storagePut(env, "navstore_" + cat, JSON.stringify(list));
    return jsonResp({ ok: true });
  }
  if (b.action === "delItem") {
    const cat = String(b.cat || "");
    const raw = await storageGet(env, "navstore_" + cat);
    let list = raw ? JSON.parse(raw) : [];
    list = list.filter((x, i) => i !== b.index);
    await storagePut(env, "navstore_" + cat, JSON.stringify(list));
    return jsonResp({ ok: true });
  }
  return jsonResp({ ok: false, error: "未知操作" }, 400);
}
