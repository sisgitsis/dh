import { jsonResp, storageGet } from "../_utils.js";

export async function onRequestGet(context) {
  const { env } = context;
  const list = JSON.parse(await storageGet(env, "shared_ids") || "[]");
  return jsonResp({ ok: true, list });
}

export async function onRequestPost() {
  return jsonResp({ ok: false, error: "Method Not Allowed" }, 405);
}
