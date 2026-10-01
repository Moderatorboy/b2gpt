import { timingSafeEqual } from "node:crypto";

const MAX_FILE_SIZE = 4 * 1024 * 1024;

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed." }, { status: 405 });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const expectedPassword = process.env.TELEUPLOAD_PASSWORD;
    if (!token || !chatId || !expectedPassword) {
      return Response.json(
        { error: "TeleUpload is not configured yet." },
        { status: 503 },
      );
    }

    let form;
    try {
      form = await request.formData();
    } catch {
      return Response.json({ error: "Invalid upload." }, { status: 400 });
    }

    const password = form.get("password");
    const file = form.get("file");
    const title = form.get("title");
    if (
      typeof password !== "string" ||
      !file ||
      typeof file.arrayBuffer !== "function"
    ) {
      return Response.json(
        { error: "Choose a file and enter the password." },
        { status: 400 },
      );
    }

    const submittedPassword = Buffer.from(password);
    const configuredPassword = Buffer.from(expectedPassword);
    if (
      submittedPassword.length !== configuredPassword.length ||
      !timingSafeEqual(submittedPassword, configuredPassword)
    ) {
      return Response.json(
        { error: "Password is incorrect." },
        { status: 401 },
      );
    }

    if (!file.size || file.size > MAX_FILE_SIZE) {
      return Response.json(
        { error: "File size must be between 1 byte and 4 MB." },
        { status: 413 },
      );
    }

    const telegramForm = new FormData();
    telegramForm.append("chat_id", chatId);
    telegramForm.append(
      "caption",
      typeof title === "string" ? title.trim() : "",
    );
    telegramForm.append(
      "document",
      new Blob([await file.arrayBuffer()], {
        type: file.type || "application/octet-stream",
      }),
      file.name || "upload",
    );

    try {
      const telegramResponse = await fetch(
        `https://api.telegram.org/bot${token}/sendDocument`,
        { method: "POST", body: telegramForm },
      );
      const result = await telegramResponse.json();
      if (!telegramResponse.ok || !result.ok) {
        return Response.json(
          { error: "Telegram could not accept this file." },
          { status: 502 },
        );
      }
      return Response.json({ ok: true });
    } catch {
      return Response.json(
        { error: "Could not connect to Telegram. Try again." },
        { status: 502 },
      );
    }
  },
};
