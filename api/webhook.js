export default async function handler(req, res) {
  // Healthcheck
  if (req.method === "GET") return res.status(200).send("OK-PROD");
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  // ✅ Verifikasi secret dari Telegram (kalau diset)
  const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  const reqSecret = req.headers["x-telegram-bot-api-secret-token"];
  if (SECRET && reqSecret !== SECRET) {
    console.warn("Invalid webhook secret:", reqSecret);
    return res.status(200).send("OK"); // ACK saja biar Telegram tidak retry
  }

  // ✅ ACK cepat supaya Telegram tidak "Read timeout expired"
  res.status(200).send("OK");

  // --- Ambil dan parse body dengan aman ---
  let body = req.body;
  try {
    if (!body || typeof body === "string") body = JSON.parse(body || "{}");
  } catch {
    console.error("Gagal parse body JSON");
    body = {};
  }

  try {
    const msg =
      body.message ||
      body.edited_message ||
      body.callback_query?.message ||
      body.my_chat_member?.chat && { chat: body.my_chat_member.chat };

    const text =
      body.message?.text ||
      body.edited_message?.text ||
      body.callback_query?.data ||
      "";

    const chatId = msg?.chat?.id;
    const from =
      body.message?.from ||
      body.edited_message?.from ||
      body.callback_query?.from ||
      body.my_chat_member?.from;

    if (!chatId) return;

    // Hanya tangani /start ...; selain itu abaikan (atau balas instruksi)
    if (!text.startsWith("/start") || !from) return;

    // Kirim pesan awal & ambil message_id untuk di-edit
    const startMsg = await sendTelegramGET(chatId, "⏳ Memproses absen…");
    const messageId = startMsg?.result?.message_id;

    // Ambil argumen /start
    const args = text.trim().split(" ");
    if (args.length < 2 || !args[1]) {
      await replyFinal(chatId, messageId, "Silakan scan QR dulu untuk absen.");
      return;
    }

    // Dukung 2 format: TOKEN_AREA atau AREA-TOKEN
    const raw = args[1].trim();
    let token = "", area = "";
    if (raw.includes("_")) {
      const [t, a] = raw.split("_");
      token = t || ""; area = a || "";
    } else if (raw.includes("-")) {
      const [a, t] = raw.split("-");
      token = t || ""; area = a || "";
    }
    if (!token || !area) {
      await replyFinal(chatId, messageId, "Format token tidak valid. Silakan scan ulang.");
      return;
    }

    const fullName = `${from.first_name || ""}${from.last_name ? " " + from.last_name : ""}`.trim();

    // URL GAS kamu (set di ENV biar fleksibel)
    const GAS = process.env.GAS_VALIDATE_URL ||
      "https://script.google.com/macros/s/AKfycbzjYLOPjkm8GvbxCgLFbysK16n1nh6YRTgmKFn7oQTGfNSS9t85JkXwfoAXEHkHbEvVXg/exec";

    const url = `${GAS}?action=absen&token=${encodeURIComponent(token)}_${encodeURIComponent(area)}&id=${encodeURIComponent(from.id)}&nama=${encodeURIComponent(fullName)}`;

    // Fallback: kalau >8 detik belum kelar, kasih pesan gagal
    let done = false;
    const fallback = setTimeout(async () => {
      if (!done) {
        done = true;
        await replyFinal(chatId, messageId, "⚠️ Server sedang lambat. Silakan coba lagi sebentar lagi.");
      }
    }, 8000);

    // Panggil GAS: timeout 6s + retry 4s
    let txt = await fetchTextWithTimeout(url, 6000).catch(() => null);
    if (!txt) txt = await fetchTextWithTimeout(url, 4000).catch(() => null);

    if (!done) {
      if (!txt) {
        await replyFinal(chatId, messageId, "⚠️ Server sedang lambat. Silakan coba lagi sebentar lagi.");
      } else if (txt.includes("✅ Absen berhasil")) {
        const waktu = new Date().toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour12: false });
        await replyFinal(
          chatId,
          messageId,
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

/** Kirim pesan via GET (lebih tahan) dan kembalikan JSON Telegram (agar dapat message_id) */
async function sendTelegramGET(chat_id, text) {
  const token = process.env.BOT_TOKEN;
  if (!token) { console.error("ENV BOT_TOKEN tidak terbaca"); return null; }
  const qs = new URLSearchParams({ chat_id: String(chat_id), text: String(text) });
  const url = `https://api.telegram.org/bot${token}/sendMessage?${qs.toString()}`;
  try {
    const r = await fetch(url, { method: "GET", cache: "no-store" });
    const j = await r.json().catch(() => null);
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

  // Coba edit dulu (rapi, tidak spam)
  if (message_id) {
    const qsEdit = new URLSearchParams({
      chat_id: String(chat_id),
      message_id: String(message_id),
      text: String(text)
    });
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/editMessageText?${qsEdit.toString()}`, {
        method: "GET", cache: "no-store"
      });
      if (r.ok) return;
      const t = await r.text().catch(() => "");
      console.error("editMessage non-200:", r.status, t);
    } catch (e) {
      console.error("editMessage failed:", e);
    }
  }

  // Kalau edit gagal / tidak ada message_id → kirim pesan baru
  const qsSend = new URLSearchParams({ chat_id: String(chat_id), text: String(text) });
  try {
    const r2 = await fetch(`https://api.telegram.org/bot${token}/sendMessage?${qsSend.toString()}`, {
      method: "GET", cache: "no-store"
    });
    if (!r2.ok) {
      const t2 = await r2.text().catch(() => "");
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
