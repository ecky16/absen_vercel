export default async function handler(req, res) {
  // Healthcheck untuk ping
  if (req.method === "GET") return res.status(200).send("OK-NODE1");
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  // ACK cepat biar Telegram nggak timeout
  res.status(200).send("OK");

  try {
    const body = req.body || {};
    const message = body?.message;
    const text = message?.text;
    const chat_id = message?.chat?.id;
    const from = message?.from;

    if (!text || !text.startsWith("/start")) return;

    const full_name = from.first_name + (from.last_name ? " " + from.last_name : "");
    const telegram_id = from.id;

    const args = text.trim().split(" ");
    if (args.length < 2 || !args[1]) {
      await sendTelegram(chat_id, "📸 Silakan *scan QR* terlebih dahulu untuk absen.", "Markdown");
      return;
    }

    const tokenArea = args[1]; // contoh: abc123_PSN
    const [token, area] = tokenArea.split("_");
    if (!token || !area) {
      await sendTelegram(chat_id, "❌ Format token tidak valid. Silakan scan ulang.");
      return;
    }

    // Feedback cepat biar terasa responsif
    await sendTelegram(chat_id, "⏳ Memproses absen…");

    const scriptURL = "https://script.google.com/macros/s/AKfycbzjYLOPjkm8GvbxCgLFbysK16n1nh6YRTgmKFn7oQTGfNSS9t85JkXwfoAXEHkHbEvVXg/exec";
    const url = `${scriptURL}?action=absen&token=${token}_${area}&id=${telegram_id}&nama=${encodeURIComponent(full_name)}`;

    // Timeout guard (6 detik)
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 6000);
    let statusAbsen = "TIMEOUT";
    try {
      const r = await fetch(url, { signal: ac.signal });
      statusAbsen = await r.text();
    } catch (_) {}
    clearTimeout(timer);

    if (statusAbsen === "TIMEOUT") {
      await sendTelegram(chat_id, "⚠️ Server sedang lambat. Coba lagi ya.");
      return;
    }

    if (statusAbsen.includes("✅ Absen berhasil")) {
      const waktu = new Date().toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour12: false });
      const pesan = `✅ Absen berhasil! Terima kasih, *${full_name}*.\n🕒 Absen pukul *${waktu} WIB*\n🏢 Lokasi Service Area *"${area}"*`;
      await sendTelegram(chat_id, pesan, "Markdown");
    } else {
      await sendTelegram(chat_id, statusAbsen || "❌ Gagal menghubungkan ke server. Silakan coba lagi.");
    }
  } catch (e) {
    console.error("Webhook error:", e);
  }
}

async function sendTelegram(chat_id, text, parse_mode = null) {
  const token = process.env.BOT_TOKEN;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  // 🔎 Guard kalau token tidak terbaca (biar ketahuan)
  if (!token) {
    console.error("ENV BOT_TOKEN TIDAK TERBACA!");
    return;
  }

  const payload = { chat_id, text };
  if (parse_mode) payload.parse_mode = parse_mode;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("sendTelegram error:", e);
  }
}
