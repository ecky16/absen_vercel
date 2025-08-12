export default async function handler(req, res) {
  try {
    const token = process.env.BOT_TOKEN || "";
    if (!token) return res.status(500).send("BOT_TOKEN kosong");
    const chatId = req.query.chat_id || "";
    const text = req.query.text || "test from vercel";
    if (!chatId) return res.status(400).send("chat_id wajib di-query");

    const qs = new URLSearchParams({ chat_id: String(chatId), text: String(text) });
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage?${qs}`, { method: "GET", cache: "no-store" });
    const body = await r.text();
    return res.status(r.ok ? 200 : 500).send(body);
  } catch (e) {
    return res.status(500).send(String(e));
  }
}
