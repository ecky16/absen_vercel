export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const body = req.body;
  const token = process.env.BOT_TOKEN;
  const scriptURL = process.env.APPS_SCRIPT_URL;

  if (!body.message || !body.message.text) {
    return res.status(200).send("No message");
  }

  const chatId = body.message.chat.id;
  const text = body.message.text.trim();
  const name = `${body.message.from.first_name || ''} ${body.message.from.last_name || ''}`.trim();
  const id = body.message.from.id;

  if (text.startsWith("/start")) {
    const args = text.split(" ");
    if (args.length > 1) {
      const tokenUser = args[1];
      const url = `${scriptURL}?action=absen&nama=${encodeURIComponent(name)}&id=${id}&token=${tokenUser}`;
      try {
        const result = await fetch(url);
        const responseText = await result.text();

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: responseText,
            parse_mode: "Markdown"
          })
        });

        return res.status(200).send('OK');
      } catch (err) {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: "❌ Gagal melakukan absen. Silakan coba lagi nanti."
          })
        });

        return res.status(500).send(err.message || 'Error saat kontak GAS');
      }
    } else {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: "⚠️ QR tidak valid. Harap scan dari layar."
        })
      });

      return res.status(200).send('No token');
    }
  }

  return res.status(200).send("OK");
}
