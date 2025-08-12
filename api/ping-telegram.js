export default async function handler(req, res) {
  try {
    const token = process.env.BOT_TOKEN || "";
    if (!token) return res.status(500).send("BOT_TOKEN kosong");

    const url = `https://api.telegram.org/bot${token}/getMe`;
    const r = await fetch(url, { method: "GET", cache: "no-store" });
    const text = await r.text();
    return res.status(200).send(`status=${r.status}\n${text}`);
  } catch (e) {
    return res.status(500).send(`fetch failed: ${e}`);
  }
}
