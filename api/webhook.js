// ✅ Node (default) runtime on Vercel
export default async function handler(req, res) {
  // 1) Izinkan GET untuk healthcheck/ping (UptimeRobot)
  if (req.method === "GET") return res.status(200).send("OK");
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  // 2) ACK cepat ke Telegram supaya nggak "Read timeout expired"
  //    (Telegram sudah puas, proses lanjutan tetap jalan di belakang)
  res.status(200).send("OK");

  try {
    const body = req.body || {};
    const message = body.message;
    const text = message?.text || "";
    const chat_id = message?.chat?.id;
    const from = message?.from;

    // Hanya proses /start
    if (!text.startsWith("/start") || !chat_id || !from) return;

    // Ambil argumen /start
    // Format kamu: /start <TOKEN_AREA>  contoh: abcd1234_PSN
    const args = text.trim().split(" ");
    if (args.length < 2 || !args[1]) {
      await sendTelegram(chat_id, "📸 Silakan *scan QR* terlebih dahulu untuk absen.", "Markdown");
      return;
    }

    const tokenArea = args[1];               // "abcd1234_PSN"
    const [token, area] = tokenArea.split("_");
    if (!token || !area) {
      await sendTelegram(chat_id, "❌ Format token tidak valid. Silakan scan ulang.");
      return;
    }

    // Kirim feedback cepat ke user (biar terasa responsif)
    await sendTelegram(chat_id, "⏳ Memproses absen...");

    // Nama & ID Telegram
    const full_name = from.first_name + (from.last_name ? " " + from.last_name : "");
    const telegram_id = from.id;

    // 3) Panggil GAS dengan timeout guard (hindari gantung >10s)
    const scriptURL = "https://script.google.com/macros/s/AKfycbzjYLOPjkm8GvbxCgLFbysK16n1nh6YRTgmKFn7oQTGfNSS9t85JkXwfoAXEHkHbEvVXg/exec";
    const url = `${scriptURL}?action=absen&token=${token}_${area}&id=${telegram_id}&nama=${encodeURIComponent(full_name)}`;

    let statusAbsen = "";
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 6000); // ⏱️ 6 detik batas
      const resp = await fetch(url, { signal: ac.signal });
      statusAbsen = await resp.text();
      clearTimeout(timer);
    } catch (err) {
      statusAbsen = "TIMEOUT";
    }

    // 4) Balas hasil
    if (statusAbsen === "TIMEOUT") {
      await sendTelegram(chat_id, "⚠️ Server sedang lambat. Coba sekali lagi ya.");
      return;
    }

    if (statusAbsen.includes("✅ Absen berhasil")) {
      const now = new Date();
      const waktu = now.toLocaleTimeString("id-ID", {
        timeZone: "Asia/Jakarta",
        hour12: false,
      });

      const pesan =
        `✅ Absen berhasil! Terima kasih, *${full_name}*.` +
        `\n🕒 Absen pukul *${waktu} WIB*` +
        `\n🏢 Lokasi Service Area *"${area}"*`;

      await sendTelegram(chat_id, pesan, "Markdown");
    } else {
      await sendTelegram(chat_id, statusAbsen || "❌ Gagal menghubungkan ke server. Silakan coba lagi.");
    }
  } catch (error) {
    console.error("Webhook error:", error);
    // Jangan lempar error ke Telegram (kita sudah ACK lebih dulu)
  }
}

async function sendTelegram(chat_id, text, parse_mode = null) {
  const telegramToken = process.env.BOT_TOKEN;
  const telegramURL = `https://api.telegram.org/bot${telegramToken}/sendMessage`;

  const payload = { chat_id, text };
  if (parse_mode) payload.parse_mode = parse_mode;

  try {
    await fetch(telegramURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("sendTelegram error:", e);
  }
}
