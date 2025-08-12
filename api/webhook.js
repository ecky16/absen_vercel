export default async function handler(req, res) {
  if (req.method === "GET") return res.status(200).send("OK-NODE2");
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  // ACK cepat ke Telegram
  res.status(200).send("OK");

  try {
    const body = req.body || {};
    const msg = body.message;
    const text = msg?.text || "";
    const chatId = msg?.chat?.id;
    const from = msg?.from;

    if (!text.startsWith("/start") || !chatId || !from) return;

    // 1) Pesan awal (harus terkirim)
    await sendTelegram(chatId, "⏳ Memproses absen…");

    // Argumen /start
    const args = text.trim().split(" ");
    if (args.length < 2) {
      await sendTelegram(chatId, "Silakan scan QR dulu untuk absen.");
      return;
    }
    const tokenArea = args[1];           // contoh: abcd1234_PSN
    const [token, area] = tokenArea.split("_");
    if (!token || !area) {
      await sendTelegram(chatId, "Format token tidak valid. Silakan scan ulang.");
      return;
    }

    const fullName = from.first_name + (from.last_name ? " " + from.last_name : "");
    const scriptURL = "https://script.google.com/macros/s/AKfycbzjYLOPjkm8GvbxCgLFbysK16n1nh6YRTgmKFn7oQTGfNSS9t85JkXwfoAXEHkHbEvVXg/exec";
    const url = `${scriptURL}?action=absen&token=${token}_${area}&id=${from.id}&nama=${encodeURIComponent(fullName)}`;

    // 2) Fallback timer: kalau 8 detik belum ada balasan akhir, kirimkan pesan gagal
    let replied = false;
    const fallback = setTimeout(async () => {
      if (!replied) {
        replied = true;
        await sendTelegram(chatId, "⚠️ Server sedang lambat. Silakan coba lagi sebentar lagi.");
      }
    }, 8000);

    // 3) Panggil GAS dengan timeout 6 detik
    let statusText = "TIMEOUT";
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 6000);
      const r = await fetch(url, { signal: ac.signal, cache: "no-store" });
      statusText = await r.text();
      clearTimeout(t);
    } catch (_) {}

    if (!replied) {
      if (statusText !== "TIMEOUT" && statusText.includes("✅ Absen berhasil")) {
        const waktu = new Date().toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour12: false });
        await sendTelegram(
          chatId,
          `✅ Absen berhasil! Terima kasih, ${fullName}.\n🕒 Absen pukul ${waktu} WIB\n🏢 Lokasi Service Area "${area}"`
        );
      } else if (statusText !== "TIMEOUT") {
        await sendTelegram(chatId, statusText || "❌ Gagal menghubungkan ke server. Silakan coba lagi.");
      } else {
        await sendTelegram(chatId, "⚠️ Server sedang lambat. Silakan coba lagi sebentar lagi.");
      }
      replied = true;
      clearTimeout(fallback);
    }
  } catch (e) {
    console.error("Webhook error:", e);
    // sudah ACK; jangan throw
  }
}

async function sendTelegram(chat_id, text) {
  const token = process.env.BOT_TOKEN;
  if (!token) { 
    console.error("ENV BOT_TOKEN tidak terbaca");
    return;
  }

  const base = `https://api.telegram.org/bot${token}/sendMessage`;
  const qs = new URLSearchParams({
    chat_id: String(chat_id),
    text: String(text)
    // parse_mode: "Markdown" // aktifkan lagi nanti kalau sudah stabil
  });

  try {
    const r = await fetch(`${base}?${qs.toString()}`, { method: "GET", cache: "no-store" });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.error("sendTelegram non-200:", r.status, t);
    }
  } catch (e) {
    console.error("sendTelegram fetch failed:", e);
  }
}
