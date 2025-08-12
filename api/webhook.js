export default async function handler(req, res) {
  if (req.method === "GET") return res.status(200).send("OK-NODE3");
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

    // Kirim pesan awal & simpan message_id untuk di-edit
    const startMsg = await sendTelegramGet(chatId, "⏳ Memproses absen…");
    const messageId = startMsg?.result?.message_id;

    // Ambil argumen
    const args = text.trim().split(" ");
    if (args.length < 2) {
      await replyFinal(chatId, messageId, "Silakan scan QR dulu untuk absen.");
      return;
    }

    const tokenArea = args[1]; // contoh: abcd1234_PSN
    const [token, area] = tokenArea.split("_");
    if (!token || !area) {
      await replyFinal(chatId, messageId, "Format token tidak valid. Silakan scan ulang.");
      return;
    }

    const fullName = from.first_name + (from.last_name ? " " + from.last_name : "");
    const GAS = "https://script.google.com/macros/s/AKfycbzjYLOPjkm8GvbxCgLFbysK16n1nh6YRTgmKFn7oQTGfNSS9t85JkXwfoAXEHkHbEvVXg/exec";
    const url = `${GAS}?action=absen&token=${token}_${area}&id=${from.id}&nama=${encodeURIComponent(fullName)}`;

    // Fallback: kalau >8 detik belum kelar, kasih pesan gagal
    let done = false;
    const fallback = setTimeout(async () => {
      if (!done) {
        done = true;
        await replyFinal(chatId, messageId, "⚠️ Server sedang lambat. Silakan coba lagi sebentar lagi.");
      }
    }, 8000);

    // Call GAS: timeout 6 detik + 1x retry singkat
    let txt = await fetchTextWithTimeout(url, 6000).catch(()=>null);
    if (!txt) txt = await fetchTextWithTimeout(url, 4000).catch(()=>null);

    if (!done) {
      if (!txt) {
        await replyFinal(chatId, messageId, "⚠️ Server sedang lambat. Silakan coba lagi sebentar lagi.");
      } else if (txt.includes("✅ Absen berhasil")) {
        const waktu = new Date().toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour12: false });
        await replyFinal(chatId, messageId,
          `✅ Absen berhasil! Terima kasih, ${fullName}.\n🕒 Absen pukul ${waktu} WIB\n🏢 Lokasi Service Area "${area}"`
        );
      } else {
        await replyFinal(chatId, messageId, txt || "❌ Gagal menghubungkan ke server. Silakan coba lagi.");
      }
      done = true;
      clearTimeout(fallback);
    }
  } catch (e) {
    console.error("Webhook error:", e);
  }
}

/** Kirim pesan via GET dan kembalikan JSON Telegram (agar dapat message_id) */
async function sendTelegramGet(chat_id, text) {
  const token = process.env.BOT_TOKEN;
  if (!token) { console.error("ENV BOT_TOKEN tidak terbaca"); return null; }
  const base = `https://api.telegram.org/bot${token}/sendMessage`;
  const qs = new URLSearchParams({ chat_id: String(chat_id), text: String(text) });
  try {
    const r = await fetch(`${base}?${qs.toString()}`, { method: "GET", cache: "no-store" });
    const j = await r.json().catch(()=>null);
    if (!r.ok) console.error("sendMessage non-200:", r.status, j);
    return j;
  } catch (e) {
    console.error("sendMessage fetch failed:", e);
    return null;
  }
}

/** Edit pesan awal menjadi hasil akhir; kalau gagal edit, kirim pesan baru */
async function replyFinal(chat_id, message_id, text) {
  const token = process.env.BOT_TOKEN;
  if (!token) { console.error("ENV BOT_TOKEN tidak terbaca"); return; }
  const baseEdit = `https://api.telegram.org/bot${token}/editMessageText`;
  const baseSend = `https://api.telegram.org/bot${token}/sendMessage`;

  // Coba edit dulu (biar rapi, bukan spam pesan)
  if (message_id) {
    const qs = new URLSearchParams({
      chat_id: String(chat_id),
      message_id: String(message_id),
      text: String(text)
    });
    try {
      const r = await fetch(`${baseEdit}?${qs.toString()}`, { method: "GET", cache: "no-store" });
      if (r.ok) return;
      const t = await r.text().catch(()=> "");
      console.error("editMessage non-200:", r.status, t);
    } catch (e) {
      console.error("editMessage failed:", e);
    }
  }

  // Kalau edit gagal / tidak ada message_id → kirim pesan baru
  const qs2 = new URLSearchParams({ chat_id: String(chat_id), text: String(text) });
  try {
    const r2 = await fetch(`${baseSend}?${qs2.toString()}`, { method: "GET", cache: "no-store" });
    if (!r2.ok) {
      const t2 = await r2.text().catch(()=> "");
      console.error("sendMessage fallback non-200:", r2.status, t2);
    }
  } catch (e2) {
    console.error("sendMessage fallback failed:", e2);
  }
}

/** Fetch text dengan timeout milidetik */
async function fetchTextWithTimeout(url, ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, cache: "no-store" });
    const txt = await r.text();
    clearTimeout(t);
    return txt;
  } finally {
    clearTimeout(t);
  }
}
