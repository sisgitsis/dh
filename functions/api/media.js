import { jsonResp } from "../_utils.js";

const API_PATH_RULES = [
  [/kugou|wangyi|qqmusic|musicsearch|songsearch|music.*search/i, "search_music"],
  [/videosearch|video.*search|search.*video/i, "search_video"],
  [/search|sousuo|_so|query|chaxun/i, "search"],
  [/qrcode|ewm|_qr|qr_/i, "qrcode"],
  [/b64|base64|md5|hash|encode|decode|encrypt|decrypt/i, "tool"],
  [/translate|fanyi/i, "translate"],
  [/short_url|dwz/i, "shorturl"],
  [/weather|tianqi/i, "weather_query"],
  [/xzys|xingzuo|horoscope|yuns|constellation/i, "horoscope"],
  [/hot|rank|bang|top|douyin|weibo|zhihu|toutiao|36kr|bili/i, "list"],
  [/mp4|video|shipin|xiaojiejie|mv_|_mv/i, "video"],
  [/music|mp3|song|gequ|yy_|_yy/i, "music"],
  [/pic|img|tu_|_tu|photo|bizhi|meinv|acg|wallpaper|image/i, "image"],
  [/yiyan|hitokoto|juzi|wenan|duanzi|joke|xiaohua|qinghua|caihongpi|tian|soul/i, "text"],
  [/ip|whois|site|phone|idcard|cha/i, "query"]
];

function deepFindUrl(obj, re) {
  if (typeof obj === "string") {
    const m = obj.match(re);
    if (m) {
      const u = m[0].replace(/\\\//g, "/");
      if (u.startsWith("http")) return u;
    }
    if (re.test(obj) && /^https?:\/\//.test(obj)) return obj;
    return null;
  }
  if (Array.isArray(obj)) {
    for (const x of obj) {
      const r = deepFindUrl(x, re);
      if (r) return r;
    }
  } else if (obj && typeof obj === "object") {
    for (const k in obj) {
      const r = deepFindUrl(obj[k], re);
      if (r) return r;
    }
  }
  return null;
}

function findHotList(o) {
  if (Array.isArray(o) && o.length >= 3 && o[0] && typeof o[0] === "object") {
    const k0 = o[0];
    if (k0.title || k0.name || k0.word || k0.keyword) {
      return o.slice(0, 30).map((x, i) => ({
        rank: x.rank || x.rank_num || (i + 1),
        title: x.title || x.name || x.word || x.keyword || "",
        hot: x.hot || x.hot_value || x.heat || x.num || "",
        url: x.url || x.link || ""
      })).filter(x => x.title);
    }
  }
  if (o && typeof o === "object") {
    for (const k in o) {
      const r = findHotList(o[k]);
      if (r) return r;
    }
  }
  return null;
}

function collectStrings(o, out) {
  if (typeof o === "string" && o.length >= 4 && o.length < 500 && !/^https?:/.test(o) && !/^(success|ok|200|true|请求成功)$/i.test(o)) {
    out.push(o);
  } else if (Array.isArray(o)) {
    o.forEach(x => collectStrings(x, out));
  } else if (o && typeof o === "object") {
    Object.values(o).forEach(x => collectStrings(x, out));
  }
}

function findMusicList(j) {
  const find = (o) => {
    if (Array.isArray(o) && o.length >= 1 && o[0] && typeof o[0] === "object") {
      const k0 = o[0];
      if (k0.url || k0.name || k0.song || k0.title) {
        return o.slice(0, 30).map((x) => ({
          name: x.name || x.song || x.title || "",
          singer: x.singer || x.artist || x.author || "",
          url: x.url || x.link || x.mp3 || x.music_url || "",
          cover: x.cover || x.pic || x.img || ""
        })).filter(x => x.url || x.name);
      }
    }
    if (o && typeof o === "object") {
      for (const k in o) {
        const r = find(o[k]);
        if (r) return r;
      }
    }
    return null;
  };
  return find(j);
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const api = String(url.searchParams.get("api") || "");
  const q = String(url.searchParams.get("q") || "");
  if (!api || !/^https?:\/\//.test(api)) {
    return jsonResp({ ok: false, error: "参数错误" }, 400);
  }
  let finalUrl = api;
  if (q) {
    const paramMatch = api.match(/[?&](\w+)=$/);
    if (paramMatch) finalUrl = api + encodeURIComponent(q);
    else finalUrl += (api.includes("?") ? "&" : "?") + "q=" + encodeURIComponent(q);
  }
  try {
    const r = await fetch(finalUrl, {
      headers: { "User‑Agent": "Mozilla/5.0", "Accept": "application/json, text/plain, */*" },
      cf: { cacheTtl: 0 }
    });
    const ct = (r.headers.get("content‑type") || "").toLowerCase();
    if (ct.includes("video")) return jsonResp({ ok: true, type: "video", url: finalUrl });
    if (ct.includes("audio")) return jsonResp({ ok: true, type: "music", url: finalUrl });
    if (ct.includes("image")) return jsonResp({ ok: true, type: "image", url: finalUrl });
    const text = await r.text();
    let j = null;
    try { j = JSON.parse(text); } catch (e) { }
    if (j === null) {
      const t = text.trim().slice(0, 500);
      if (t) return jsonResp({ ok: true, type: "text", text: t });
      return jsonResp({ ok: false, error: "无法解析接口返回" }, 400);
    }
    let detType = "";
    try {
      const purl = new URL(api);
      const path = purl.pathname + purl.search;
      for (const [re, t] of API_PATH_RULES) {
        if (re.test(path)) { detType = t; break; }
      }
    } catch (e) { }

    if (detType === "video" || detType === "search_video") {
      const v = deepFindUrl(j, /https?:\\?\/\\?\/[^\s"'\\\]\[{},]+\.(?:mp4|m3u8|avi|mov|flv)[^\s"'\\\]\[{},]*/i);
      if (v) return jsonResp({ ok: true, type: "video", url: v.replace(/\\\//g, "/") });
    }
    if (detType === "music" || detType === "search_music") {
      const v = deepFindUrl(j, /https?:\\?\/\\?\/[^\s"'\\\]\[{},]+\.(?:mp3|m4a|ogg|flac|wav|aac)[^\s"'\\\]\[{},]*/i);
      if (v) {
        const items = findMusicList(j);
        if (items && items.length > 1) return jsonResp({ ok: true, type: "music_list", items });
        return jsonResp({ ok: true, type: "music", url: v.replace(/\\\//g, "/") });
      }
      const items = findMusicList(j);
      if (items && items.length) return jsonResp({ ok: true, type: "music_list", items });
    }
    if (detType === "image") {
      const v = deepFindUrl(j, /https?:\\?\/\\?\/[^\s"'\\\]\[{},]+\.(?:jpg|jpeg|png|gif|webp|bmp)[^\s"'\\\]\[{},]*/i);
      if (v) return jsonResp({ ok: true, type: "image", url: v.replace(/\\\//g, "/") });
    }
    if (detType === "list") {
      const list = findHotList(j);
      if (list && list.length) return jsonResp({ ok: true, type: "list", items: list });
    }
    if (detType === "text" || detType === "horoscope") {
      const strs = []; collectStrings(j, strs);
      if (strs.length) return jsonResp({ ok: true, type: detType, text: strs.join("\n") });
    }
    if (["qrcode", "tool", "translate", "query", "shorturl", "weather_query"].includes(detType)) {
      return jsonResp({ ok: true, type: detType, raw: j });
    }
    const list = findHotList(j);
    if (list && list.length) return jsonResp({ ok: true, type: "list", items: list });
    let v = deepFindUrl(j, /https?:\\?\/\\?\/[^\s"'\\\]\[{},]+\.(?:mp4|m3u8)[^\s"'\\\]\[{},]*/i);
    if (v) return jsonResp({ ok: true, type: "video", url: v.replace(/\\\//g, "/") });
    v = deepFindUrl(j, /https?:\\?\/\\?\/[^\s"'\\\]\[{},]+\.(?:mp3|m4a|ogg|flac)[^\s"'\\\]\[{},]*/i);
    if (v) {
      const items = findMusicList(j);
      if (items && items.length > 1) return jsonResp({ ok: true, type: "music_list", items });
      return jsonResp({ ok: true, type: "music", url: v.replace(/\\\//g, "/") });
    }
    v = deepFindUrl(j, /https?:\\?\/\\?\/[^\s"'\\\]\[{},]+\.(?:jpg|jpeg|png|gif|webp)[^\s"'\\\]\[{},]*/i);
    if (v) return jsonResp({ ok: true, type: "image", url: v.replace(/\\\//g, "/") });
    const strs = []; collectStrings(j, strs);
    if (strs.length) return jsonResp({ ok: true, type: "text", text: strs.join("\n") });
    return jsonResp({ ok: true, type: "raw", raw: j });
  } catch (e) {
    return jsonResp({ ok: false, error: "请求接口失败：" + e.message }, 500);
  }
}

export async function onRequestPost() {
  return jsonResp({ ok: false, error: "Method Not Allowed" }, 405);
}
