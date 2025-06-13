
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send("Method Not Allowed");

  const { message } = req.body;
  if (!message || !message.text) return res.status(200).send("OK");

  const chat_id = message.chat.id;
  const text = message.text.trim();
  const full_name = `${message.from.first_name} ${message.from.last_name || ""}`.trim();
  const telegram_id = message.from.id;

  if (text.startsWith("/start")) {
    const args = text.split(" ");
    const token = args[1] || "";

    if (!token) {
      await sendTelegram(chat_id, "⚠️ Kamu belum scan QR. Silakan scan QR dari layar TV.");
      return res.status(200).send("OK");
    }

    try {
      const scriptRes = await fetch(`${process.env.APPS_SCRIPT_URL}?action=absen&nama=${encodeURIComponent(full_name)}&id=${telegram_id}&token=${token}`);
      const result = await scriptRes.text();
      await sendTelegram(chat_id, result);
    } catch (err) {
      await sendTelegram(chat_id, "🚨 Gagal menghubungi sistem absensi.");
    }
  }

  return res.status(200).send("OK");

  async function sendTelegram(chat_id, message) {
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id, text: message }),
    });
  }
}
