import { jsonResp, isLoggedIn, getKVData, saveKVData, batchCacheIcons } from "../_utils.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!(await isLoggedIn(request, env))) {
    return jsonResp({ ok: false, error: "Unauthorized" }, 401);
  }
  try {
    const data = await getKVData(env);
    // 全部站点图标重新走R2缓存
    data.sites = await batchCacheIcons(env, data.sites);
    await saveKVData(env, data);
    return jsonResp({ ok: true, total: data.sites.length });
  } catch (err) {
    return jsonResp({ ok: false, error: err.message }, 500);
  }
}

export async function onRequestGet() {
  return jsonResp({ ok: false, error: "Method Not Allowed" }, 405);
}
