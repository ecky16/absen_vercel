// webhook.js
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const body = req.body;
  const message = body?.message;
  const text = message?.text;
  const chat_id = message?.chat?.id;
  const from = message?.from;

  if (!text || !text.startsWith("/start")) return res.status(200).send("OK");

  const full_name = from.first_name + (from.last_name ? " " + from.last_name : "");
  const telegram_id = from.id;

  const args = text.split(" ");
  if (args.length < 2) {
    await sendTelegram(chat_id, "⚠️ Token tidak ditemukan. Silakan scan QR terbaru.");
    return res.status(200).send("OK");
  }

  const tokenArea = args[1]; // format: abc123_PBL
  const scriptURL = "https://script.google.com/macros/s/AKfycbzjYLOPjkm8GvbxCgLFbysK16n1nh6YRTgmKFn7oQTGfNSS9t85JkXwfoAXEHkHbEvVXg/exec";
  const url = `${scriptURL}?action=absen&token=${tokenArea}&id=${telegram_id}&nama=${encodeURIComponent(full_name)}`;

  const resScript = await fetch(url);
  const textResult = await resScript.text();

  await sendTelegram(chat_id, textResult);
  return res.status(200).send("OK");
}

async function sendTelegram(chat_id, text) {
  const telegramToken = process.env.BOT_TOKEN;
  const telegramURL = `https://api.telegram.org/bot${telegramToken}/sendMessage`;
  await fetch(telegramURL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, text })
  });
}
