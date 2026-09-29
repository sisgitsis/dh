import { jsonResp, isLoggedIn, getKVData, saveKVData, batchCacheIcons } from "../_utils.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  // 鉴权
  if (!(await isLoggedIn(request, env))) {
    return jsonResp({ ok: false, error: "Unauthorized" }, 401);
  }
  try {
    const body = await request.json();
    if (!body) return jsonResp({ ok: false, error: "请求体为空" }, 400);

    // R2缓存图标
    body.sites = await batchCacheIcons(env, body.sites ?? []);

    await saveKVData(env, {
      categories: body.categories ?? [],
      sites: body.sites ?? [],
      settings: body.settings ?? {}
    });
    return jsonResp({ ok: true });
  } catch (err) {
    return jsonResp({ ok: false, error: err.message }, 500);
  }
}

// GET 不允许
export async function onRequestGet() {
  return jsonResp({ ok: false, error: "Method Not Allowed" }, 405);
}
