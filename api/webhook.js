export default async function handler(req, res) {
  // Healthcheck
  if (req.method === "GET") return res.status(200).send("OK-DEBUG2");
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  // ACK cepat
  res.status(200).send("OK");

  // --- DEBUG: parse body aman ---
  let body = req.body;
  try {
    if (!body || typeof body === "string") body = JSON.parse(body || "{}");
  } catch {
    console.error("Gagal parse body JSON");
    body = {};
  }

  try {
    const msg = body.message || body.edited_message || body.callback_query?.message;
    const text = body.message?.text || body.edited_message?.text || body.callback_query?.data || "";
    const chatId = msg?.chat?.id;

    console.log("DEBUG update", {
      hasMessage: !!body.message,
      hasEdited: !!body.edited_message,
      hasCallback: !!body.callback_query,
      chatId,
      text
    });

    if (!chatId) return;

    await sendTelegramGET(chatId, `ECHO: ${text || "(tanpa teks)"} — webhook OK`);
  } catch (e) {
    console.error("DEBUG handler error:", e);
  }
}

async function sendTelegramGET(chat_id, text) {
  const token = process.env.BOT_TOKEN;
  if (!token) { console.error("ENV BOT_TOKEN tidak terbaca"); return; }
  const qs = new URLSearchParams({ chat_id: String(chat_id), text: String(text) });
  const url = `https://api.telegram.org/bot${token}/sendMessage?${qs.toString()}`;
  try {
    const r = await fetch(url, { method: "GET", cache: "no-store" });
    const j = await r.json().catch(()=>null);
    if (!r.ok) console.error("sendMessage non-200:", r.status, j);
    else console.log("sendMessage OK:", j?.result?.message_id);
  } catch (e) {
    console.error("sendMessage fetch failed:", e);
  }
}
