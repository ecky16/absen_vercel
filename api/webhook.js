export default async function handler(req, res) {
  if (req.method === "GET") return res.status(200).send("OK-PATCH");
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  // ✅ ACK cepat supaya Telegram tidak timeout
  res.status(200).send("OK");

  // Parse body aman (kadang req.body berupa string)
  let body = req.body;
  try { if (!body || typeof body === "string") body = JSON.parse(body || "{}"); } catch { body = {}; }

  try {
    const message = body?.message;
    const text = message?.text || "";
    const chat_id = message?.chat?.id;
    const from = message?.from;

    if (!text.startsWith("/start") || !chat_id || !from) return;

    const full_name = `${from.first_name || ""}${from.last_name ? " " + from.last_name : ""}`.trim();

    const args = text.trim().split(/\s+/);
    const raw = args[1] || "";
    let token = "", area = "";

    // Dukung 2 format: TOKEN_AREA atau AREA-TOKEN
    if (raw.includes("_")) {
      const [t, a] = raw.split("_");
      token = t || ""; area = a || "";
    } else if (raw.includes("-")) {
      const [a, t] = raw.split("-");
      token = t || ""; area = a || "";
    }

    if (!token || !area) {
      await sendTelegramGET(chat_id, "❌ Format token tidak valid. Silakan scan ulang.");
      return;
    }

    // Feedback cepat ke user
    await sendTelegramGET(chat_id, "⏳ Memproses absen…");

    // URL GAS (pakai ENV kalau ada)
    const scriptURL =
      process.env.GAS_VALIDATE_URL ||
      process.env.APP_SCRIPT_URL ||
      "https://script.google.com/macros/s/AKfycbzjYLOPjkm8GvbxCgLFbysK16n1nh6YRTgmKFn7oQTGfNSS9t85JkXwfoAXEHkHbEvVXg/exec";

    const qs = new URLSearchParams({
      action: "absen",
      token: `${token}_${area}`,
      id: String(from.id),
      nama: full_name
    });

    // ⏱️ Timeout & retry ke GAS (6s + 4s)
    let statusAbsen = await fetchTextWithTimeout(`${scriptURL}?${qs.toString()}`, 6000).catch(() => null);
    if (!statusAbsen) statusAbsen = await fetchTextWithTimeout(`${scriptURL}?${qs.toString()}`, 4000).catch(() => null);

    if (!statusAbsen) {
      await sendTelegramGET(chat_id, "⚠️ Server sedang lambat. Coba lagi ya.");
      return;
    }

    if (statusAbsen.includes("✅ Absen berhasil")) {
      const waktu = new Date().toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour12: false });
      const pesan =
        `✅ Absen berhasil! Terima kasih, *${full_name}*.` +
        `\n🕒 Absen pukul *${waktu} WIB*` +
        `\n🏢 Lokasi Service Area *"${area}"*`;

      await sendTelegram(chat_id, pesan, "Markdown"); // POST
    } else {
      await sendTelegramGET(chat_id, statusAbsen);     // GET
    }
  } catch (e) {
    console.error("Webhook error:", e);
  }
}

// ===== helper =====
async function fetchTextWithTimeout(url, ms) {
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, cache: "no-store" });
    return await r.text();
  } finally {
    clearTimeout(to);
  }
}

async function sendTelegram(chat_id, text, parse_mode = null) {
  const token = process.env.BOT_TOKEN;
  if (!token) { console.error("ENV BOT_TOKEN kosong"); return; }
  const telegramURL = `https://api.telegram.org/bot${token}/sendMessage`;

  const payload = { chat_id, text };
  if (parse_mode) payload.parse_mode = parse_mode;

  try {
    await fetch(telegramURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("sendTelegram POST failed:", e);
    // Fallback pakai GET supaya tetap nyampai
    await sendTelegramGET(chat_id, text);
  }
}

async function sendTelegramGET(chat_id, text) {
  const token = process.env.BOT_TOKEN;
  if (!token) { console.error("ENV BOT_TOKEN kosong"); return; }
  const url = `https://api.telegram.org/bot${token}/sendMessage?` +
              new URLSearchParams({ chat_id: String(chat_id), text: String(text) }).toString();
  try {
    await fetch(url, { method: "GET", cache: "no-store" });
  } catch (e) {
    console.error("sendTelegram GET failed:", e);
  }
}
