import { jsonResp, isLoggedIn, storageGet, storagePut } from "../_utils.js";

const WIDGET_CATS = ["基础", "娱乐"];

function builtinWidget(cat) {
  const all = {
    "基础": [
      { type: "clock", name: "时钟日历", icon: "🕐", size: "2x1" },
      { type: "weather", name: "天气", icon: "🌤", size: "2x1" },
      { type: "todo", name: "备忘录", icon: "📝", size: "2x2" }
    ],
    "娱乐": [
      { type: "hitokoto", name: "一言", icon: "📜", size: "2x1" },
      { type: "calc", name: "计算器", icon: "🧮", size: "2x2" },
      { type: "countdown", name: "倒计时", icon: "⏳", size: "2x1" }
    ]
  };
  return all[cat] || [];
}

function normalizeWidgetItem(s) {
  let type = s.type || "";
  const n = String(s.name || s.title || "").toLowerCase();
  const apiUrl = s.url || s.api || "";
  if (!type) {
    if (/clock|时钟/.test(n)) type = "clock";
    else if (/weather|天气/.test(n)) type = "weather";
    else if (/todo|memo|备忘/.test(n)) type = "todo";
    else if (/countdown|倒计时/.test(n)) type = "countdown";
    else if (/hitokoto|一言|句子/.test(n)) type = "hitokoto";
    else if (/calc|计算/.test(n)) type = "calc";
    else if (apiUrl) type = "media";
    else type = "custom";
  }
  return {
    type,
    name: s.name || s.title || "小组件",
    icon: s.icon || s.imgSrc || "🧩",
    size: s.size || "2x1",
    html: s.html || "",
    url: apiUrl,
    param: s.param || "",
    desc: s.desc || s.description || ""
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const cat = String(url.searchParams.get("cat") || "");

  if (cat === "__cats__") {
    const raw = await storageGet(env, "widgetstore_cats");
    const list = raw ? JSON.parse(raw) : WIDGET_CATS;
    return jsonResp({ ok: true, list });
  }

  const page = parseInt(url.searchParams.get("page") || "1");
  const rawApi = await storageGet(env, "widgetstore_api_" + cat);
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
      else arr = j.data || j.list || j.result || j.items || [];
      if (!Array.isArray(arr)) arr = [];
      const list = arr.map(s => normalizeWidgetItem(s)).filter(x => x.name);
      return jsonResp({
        ok: true, list, fromApi: true,
        page: j.page || page, pages: j.pages || 0, total: j.count || 0
      });
    } catch (e) { /* fall through */ }
  }

  const raw = await storageGet(env, "widgetstore_" + cat);
  const list = raw ? JSON.parse(raw) : builtinWidget(cat);
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

  const catsRaw = await storageGet(env, "widgetstore_cats");
  let cats = catsRaw ? JSON.parse(catsRaw) : WIDGET_CATS;

  if (b.action === "addCat") {
    if (!cats.includes(b.cat)) cats.push(b.cat);
    await storagePut(env, "widgetstore_cats", JSON.stringify(cats));
    if (b.api) await storagePut(env, "widgetstore_api_" + b.cat, String(b.api));
    return jsonResp({ ok: true });
  }
  if (b.action === "delCat") {
    cats = cats.filter(c => c !== b.cat);
    await storagePut(env, "widgetstore_cats", JSON.stringify(cats));
    return jsonResp({ ok: true });
  }
  if (b.action === "save") {
    if (!Array.isArray(b.list)) return jsonResp({ ok: false, error: "list必须是数组" }, 400);
    await storagePut(env, "widgetstore_" + b.cat, JSON.stringify(b.list));
    return jsonResp({ ok: true });
  }
  if (b.action === "setApi") {
    await storagePut(env, "widgetstore_api_" + b.cat, b.api ? String(b.api) : "");
    return jsonResp({ ok: true });
  }
  if (b.action === "addItem") {
    const cat = String(b.cat || "");
    const raw = await storageGet(env, "widgetstore_" + cat);
    const list = raw ? JSON.parse(raw) : builtinWidget(cat);
    list.unshift(b.item);
    await storagePut(env, "widgetstore_" + cat, JSON.stringify(list));
    return jsonResp({ ok: true });
  }
  if (b.action === "editItem") {
    const cat = String(b.cat || "");
    const raw = await storageGet(env, "widgetstore_" + cat);
    let list = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex((x, i) => i === b.index);
    if (idx >= 0) list[idx] = b.item;
    await storagePut(env, "widgetstore_" + cat, JSON.stringify(list));
    return jsonResp({ ok: true });
  }
  if (b.action === "delItem") {
    const cat = String(b.cat || "");
    const raw = await storageGet(env, "widgetstore_" + cat);
    let list = raw ? JSON.parse(raw) : [];
    list = list.filter((x, i) => i !== b.index);
    await storagePut(env, "widgetstore_" + cat, JSON.stringify(list));
    return jsonResp({ ok: true });
  }
  return jsonResp({ ok: false, error: "未知操作" }, 400);
}
