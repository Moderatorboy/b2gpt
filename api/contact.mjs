const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const MAX_PHONE_LENGTH = 30;
const MAX_MESSAGE_LENGTH = 3000;

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed." }, { status: 405 });
    }

    let data;
    try {
      data = await request.json();
    } catch {
      return Response.json({ error: "Invalid form submission." }, { status: 400 });
    }

    if (typeof data.website === "string" && data.website.trim()) {
      return Response.json({ ok: true });
    }

    const name = typeof data.name === "string" ? data.name.trim() : "";
    const email = typeof data.email === "string" ? data.email.trim() : "";
    const phone = typeof data.phone === "string" ? data.phone.trim() : "";
    const message = typeof data.message === "string" ? data.message.trim() : "";

    if (!name || !email || !phone || !message) {
      return Response.json(
        { error: "Please fill in your name, email, phone, and message." },
        { status: 400 },
      );
    }
    if (
      name.length > MAX_NAME_LENGTH ||
      email.length > MAX_EMAIL_LENGTH ||
      phone.length > MAX_PHONE_LENGTH ||
      message.length < 5 ||
      message.length > MAX_MESSAGE_LENGTH ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !/^\+?[0-9().\s-]+$/.test(phone) ||
      (phone.match(/[0-9]/g) || []).length < 7
    ) {
      return Response.json(
        { error: "Please check the contact details and try again." },
        { status: 400 },
      );
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
      return Response.json(
        { error: "Contact form is not configured yet." },
        { status: 503 },
      );
    }

    const text = [
      "New portfolio contact",
      `Name: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone}`,
      "Message:",
      message,
    ].join("\n");

    try {
      const telegramResponse = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text }),
        },
      );
      const result = await telegramResponse.json();
      if (!telegramResponse.ok || !result.ok) {
        return Response.json(
          { error: "Telegram could not accept the message." },
          { status: 502 },
        );
      }
      return Response.json({ ok: true });
    } catch {
      return Response.json(
        { error: "Could not connect to Telegram. Please try again." },
        { status: 502 },
      );
    }
  },
};