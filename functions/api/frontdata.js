import { jsonResp, getKVData } from "../_utils.js";

export async function onRequestGet(context) {
  const { env } = context;
  const data = await getKVData(env);
  return jsonResp({ ok: true, data });
}

export async function onRequestPost() {
  return jsonResp({ ok: false, error: "Method Not Allowed" }, 405);
}
