import { jsonResp, storageGet, storagePut } from "../_utils.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const b = await request.json();
    const id = String(b.id ?? "");
    if (!/^\d{6,9}$/.test(id)) {
      return jsonResp({ ok: false, error: "ID格式错误" }, 400);
    }
    let list = JSON.parse(await storageGet(env, "shared_ids") || "[]");
    list = list.filter(x => x.id !== id);
    list.unshift({ id, ts: Date.now() });
    if (list.length > 200) list = list.slice(0, 200);
    await storagePut(env, "shared_ids", JSON.stringify(list));
    return jsonResp({ ok: true });
  } catch (e) {
    return jsonResp({ ok: false, error: "Invalid JSON" }, 400);
  }
}

export async function onRequestGet() {
  return jsonResp({ ok: false, error: "Method Not Allowed" }, 405);
}
