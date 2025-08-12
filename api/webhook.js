export default async function handler(req, res) {
  if (req.method === "GET") return res.status(200).send("OK-DIAG");
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  // ACK cepat
  res.status(200).send("OK");

  // Parse body aman
  let body = req.body;
  try { if (!body || typeof body === "string") body = JSON.parse(body || "{}"); } catch { body = {}; }

  // Ambil teks & chat id dari berbagai tipe update
  const msg = body.message || body.edited_message || body.callback_query?.message;
  const text = body.message?.text || body.edited_message?.text || body.callback_query?.data || "";
  const chatId = msg?.chat?.id;

  console.log("DIAG update:", { hasMsg: !!body.message, chatId, text });

  if (!chatId) return;
  await sendGET(chatId, `ECHO: ${text || "(tanpa teks)"} — webhook OK`);
}

async function sendGET(chat_id, text){
  const token = process.env.BOT_TOKEN;
  if (!token) { console.error("BOT_TOKEN kosong"); return; }
  const qs = new URLSearchParams({ chat_id: String(chat_id), text: String(text) });
  const url = `https://api.telegram.org/bot${token}/sendMessage?${qs.toString()}`;
  try {
    const r = await fetch(url, { method: "GET", cache: "no-store" });
    const j = await r.json().catch(()=>null);
    if (!r.ok) console.error("sendMessage non-200:", r.status, j);
    else console.log("sendMessage OK:", j?.result?.message_id);
  } catch(e){ console.error("sendMessage fetch failed:", e); }
}
