export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const body = req.body;
  const message = body?.message;
  const text = message?.text;
  const chat_id = message?.chat?.id;
  const from = message?.from;

  if (!text || !text.startsWith("/start")) {
    return res.status(200).send("OK");
  }

  const full_name = from.first_name + (from.last_name ? " " + from.last_name : "");
  const telegram_id = from.id;

  const args = text.trim().split(" ");
  if (args.length < 2 || !args[1]) {
    await sendTelegram(chat_id, "📸 Silakan *scan QR* terlebih dahulu untuk absen.", "Markdown");
    return res.status(200).send("OK");
  }

  const tokenArea = args[1]; // Contoh: abc123_PSN
  const [token, area] = tokenArea.split("_");
  if (!token || !area) {
    await sendTelegram(chat_id, "❌ Format token tidak valid. Silakan scan ulang.");
    return res.status(200).send("OK");
  }

  const scriptURL = "https://script.google.com/macros/s/AKfycbzjYLOPjkm8GvbxCgLFbysK16n1nh6YRTgmKFn7oQTGfNSS9t85JkXwfoAXEHkHbEvVXg/exec";
  const url = `${scriptURL}?action=absen&token=${token}_${area}&id=${telegram_id}&nama=${encodeURIComponent(full_name)}`;

  try {
    const resScript = await fetch(url);
    const statusAbsen = await resScript.text();

    if (statusAbsen.includes("✅ Absen berhasil")) {
      const now = new Date();
      const waktu = now.toLocaleTimeString("id-ID", {
        timeZone: "Asia/Jakarta",
        hour12: false,
      });

      const pesan = `✅ Absen berhasil! Terima kasih, *${full_name}*.` +
                    `\n🕒 Absen pukul *${waktu} WIB*` +
                    `\n🏢 Lokasi Service Area *"${area}"*`;

      await sendTelegram(chat_id, pesan, "Markdown");
    } else {
      await sendTelegram(chat_id, statusAbsen);
    }
  } catch (error) {
    console.error("GAGAL fetch Apps Script:", error);
    await sendTelegram(chat_id, "❌ Gagal menghubungkan ke server. Silakan coba lagi.");
  }

  return res.status(200).send("OK");
}

async function sendTelegram(chat_id, text, parse_mode = null) {
  const telegramToken = process.env.BOT_TOKEN;
  const telegramURL = `https://api.telegram.org/bot${telegramToken}/sendMessage`;

  const payload = {
    chat_id,
    text,
  };

  if (parse_mode) {
    payload.parse_mode = parse_mode;
  }

  await fetch(telegramURL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
