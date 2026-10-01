import { createHash } from "node:crypto";

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const MAX_PHONE_LENGTH = 30;
const MAX_MESSAGE_LENGTH = 3000;

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const ordinal = (number) => {
  const lastTwoDigits = number % 100;
  const suffix =
    lastTwoDigits >= 11 && lastTwoDigits <= 13
      ? "th"
      : ({ 1: "st", 2: "nd", 3: "rd" }[number % 10] || "th");
  return `${number}${suffix}`;
};

async function getInquiryCount(email) {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) return null;

  const emailHash = createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex");

  try {
    const response = await fetch(
      `${redisUrl.replace(/\/+$/, "")}/incr/${encodeURIComponent(`contact:${emailHash}`)}`,
      { headers: { Authorization: `Bearer ${redisToken}` } },
    );
    const result = await response.json();
    if (!response.ok || !Number.isSafeInteger(result.result) || result.result < 1) {
      throw new Error("Invalid counter response.");
    }
    return result.result;
  } catch {
    console.error("Contact inquiry counter unavailable.");
    return null;
  }
}

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
    if (!data || typeof data !== "object" || Array.isArray(data)) {
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

    const count = await getInquiryCount(email);
    const title =
      count === null
        ? "<b>Contact Inquiry</b> <i>(counter unavailable)</i>"
        : count === 1
          ? "🆕 <b>New Inquiry</b>"
          : `🔁 <b>Returning Visitor</b> (${ordinal(count)} message)`;
    const text = [
      title,
      "",
      `👤 <b>Name:</b> ${escapeHtml(name)}`,
      `📧 <b>Email:</b> ${escapeHtml(email)}`,
      `📞 <b>Phone:</b> ${escapeHtml(phone)}`,
      "",
      `💬 <b>Message:</b>\n<i>${escapeHtml(message)}</i>`,
      "",
      `🕒 ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
    ].join("\n");

    try {
      const telegramResponse = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
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