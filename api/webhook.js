// api/webhook.js — SYNC + single wait (≤ ~8.8s)
export default async function handler(req, res) {
  if (req.method === "GET") return res.status(200).send("OK-SYNC3");
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  // --- parse body aman (kadang body berupa string) ---
  let body = req.body;
  try { if (!body || typeof body === "string") body = JSON.parse(body || "{}"); } catch { body = {}; }

  try {
    const msg =
      body.message ||
      body.edited_message ||
      body.callback_query?.message;

    const text =
      body.message?.text ||
      body.edited_message?.text ||
      body.callback_query?.data ||
      "";

    const chatId = msg?.chat?.id;
    const from =
      body.message?.from ||
      body.edited_message?.from ||
      body.callback_query?.from;

    // selalu balas 200 di akhir handler (biar Telegram tak retry)
    if (!chatId || !from || !text.startsWith("/start")) {
      return res.status(200).send("OK");
    }

    // --- ambil argumen /start ---
    const args = text.trim().split(/\s+/);
    if (args.length < 2) {
      await sendMessageGET(chatId, "📸 Silakan scan QR terlebih dahulu untuk absen.");
      return res.status(200).send("OK");
    }

    // Dukung 2 format payload: TOKEN_AREA atau AREA-TOKEN
    const raw = args[1].trim();
    let token = "", area = "";
    if (raw.includes("_")) {
      const [t, a] = raw.split("_");
      token = (t || "").trim();
      area  = (a || "").trim();
    } else if (raw.includes("-")) {
      const [a, t] = raw.split("-");
      token = (t || "").trim();
      area  = (a || "").trim();
    }

    if (!token || !area) {
      await sendMessageGET(chatId, "❌ Format token tidak valid. Silakan scan ulang.");
      return res.status(200).send("OK");
    }

    const fullName = `${from.first_name || ""}${from.last_name ? " " + from.last_name : ""}`.trim();

    // 1) kirim pesan awal (ambil message_id untuk di-edit)
    const startResp = await sendMessageGET(chatId, "⏳ Memproses absen...");
    const messageId = startResp?.result?.message_id;

    // 2) panggil GAS — single wait (<= 8800 ms) agar total < 10s
    const GAS =
      process.env.GAS_VALIDATE_URL ||
      process.env.APP_SCRIPT_URL ||
      "https://script.google.com/macros/s/AKfycbzjYLOPjkm8GvbxCgLFbysK16n1nh6YRTgmKFn7oQTGfNSS9t85JkXwfoAXEHkHbEvVXg/exec";

    const qs = new URLSearchParams({
      action: "absen",
      token: `${token}_${area}`,
      id: String(from.id),
      nama: fullName,
      // alias param biar kompatibel dengan variasi GAS
      tg_id: String(from.id),
      tg_name: fullName,
      area: area,
      token_area: `${token}_${area}`
    });

    const URL_GAS = `${GAS}?${qs.toString()}`;
    const statusText = await fetchTextWithTimeout(URL_GAS, 8800).catch(() => null);

    if (!statusText) {
      await editOrSend(chatId, messageId, "⚠️ Server sedang lambat. Silakan coba lagi sebentar lagi.");
      return res.status(200).send("OK");
    }

    if (isSuccess(statusText)) {
      const waktu = new Date().toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour12: false });
      await editOrSend(
        chatId,
        messageId,
        `✅ Absen berhasil! Terima kasih, ${fullName}.\n🕒 Absen pukul ${waktu} WIB\n🏢 Lokasi Service Area "${area}"`
      );
    } else {
      await editOrSend(chatId, messageId, statusText);
    }

    return res.status(200).send("OK");
  } catch (e) {
    console.error("Webhook fatal error:", e);
    return res.status(200).send("OK");
  }
}

/* ==================== helpers ==================== */

function isSuccess(txt) {
  // Bisa teks biasa "✅ Absen berhasil" atau JSON { ok:true, msg:"..." }
  try {
    const j = JSON.parse(txt);
    if (j && (j.ok === true || /berhasil/i.test(String(j.msg || "")))) return true;
  } catch (_) {}
  return /✅\s*Absen berhasil/i.test(String(txt));
}

// Kirim pesan via GET (lebih tahan gangguan jaringan)
async function sendMessageGET(chat_id, text, parse_mode) {
  const token = process.env.BOT_TOKEN;
  if (!token) { console.error("ENV BOT_TOKEN kosong"); return null; }
  const qs = new URLSearchParams({ chat_id: String(chat_id), text: String(text) });
  if (parse_mode) qs.set("parse_mode", parse_mode);
  const url = `https://api.telegram.org/bot${token}/sendMessage?${qs.toString()}`;
  try {
    const r = await fetch(url, { method: "GET", cache: "no-store" });
    const j = await r.json().catch(() => null);
    if (!r.ok) console.error("sendMessage non-200:", r.status, j);
    return j;
  } catch (e) {
    console.error("sendMessage GET failed:", e);
    return null;
  }
}

// Edit pesan awal; kalau gagal, kirim pesan baru
async function editOrSend(chat_id, message_id, text, parse_mode) {
  if (message_id) {
    const ok = await editMessageGET(chat_id, message_id, text, parse_mode);
    if (ok) return;
  }
  await sendMessageGET(chat_id, text, parse_mode);
}

async function editMessageGET(chat_id, message_id, text, parse_mode) {
  const token = process.env.BOT_TOKEN;
  if (!token) { console.error("ENV BOT_TOKEN kosong"); return false; }
  const qs = new URLSearchParams({
    chat_id: String(chat_id),
    message_id: String(message_id),
    text: String(text)
  });
  if (parse_mode) qs.set("parse_mode", parse_mode);
  const url = `https://api.telegram.org/bot${token}/editMessageText?${qs.toString()}`;
  try {
    const r = await fetch(url, { method: "GET", cache: "no-store" });
    if (r.ok) return true;
    const t = await r.text().catch(() => "");
    console.error("editMessage non-200:", r.status, t);
    return false;
  } catch (e) {
    console.error("editMessage GET failed:", e);
    return false;
  }
}

async function fetchTextWithTimeout(url, ms) {
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, cache: "no-store" });
    const t = await r.text();
    clearTimeout(to);
    return t;
  } finally {
    clearTimeout(to);
  }
}
