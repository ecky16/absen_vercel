// Webhook Telegram via Vercel — Absen QR 3 Area (PSN, PBL, LMJ)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const body = req.body;
  const message = body?.message;
  const webAppData = message?.web_app_data;

  if (!webAppData) {
    return res.status(200).send("No WebAppData");
  }

  try {
    const tokenArea = webAppData.data; // format: token_area (contoh: abc123_PSN)
    const from = message.from;
    const nama = from.first_name + (from.last_name ? ' ' + from.last_name : '');
    const id = from.id;

    // Kirim ke Apps Script
    const scriptURL = `https://script.google.com/macros/s/AKfycbzjYLOPjkm8GvbxCgLFbysK16n1nh6YRTgmKFn7oQTGfNSS9t85JkXwfoAXEHkHbEvVXg/exec`;
    const url = `${scriptURL}?action=absen&token=${tokenArea}&id=${id}&nama=${encodeURIComponent(nama)}`;

    const response = await fetch(url);
    const resultText = await response.text();

    // Kirim balasan ke Telegram
    const telegramToken = process.env.BOT_TOKEN;
    const telegramURL = `https://api.telegram.org/bot${telegramToken}/sendMessage`;
    await fetch(telegramURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: message.chat.id,
        text: resultText
      })
    });

    res.status(200).send("OK");
  } catch (err) {
    console.error("Error handling WebAppData:", err);
    res.status(500).send("Internal Server Error");
  }
}
