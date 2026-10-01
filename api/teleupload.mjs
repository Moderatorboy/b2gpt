import { del, get } from "@vercel/blob";
import { timingSafeEqual } from "node:crypto";

const UPLOAD_PREFIX = "teleupload/";

function passwordMatches(submitted, expected) {
  if (typeof submitted !== "string" || !expected) return false;
  const submittedBuffer = Buffer.from(submitted);
  const expectedBuffer = Buffer.from(expected);
  return (
    submittedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(submittedBuffer, expectedBuffer)
  );
}

function validUploadPath(pathname) {
  return (
    typeof pathname === "string" &&
    pathname.startsWith(UPLOAD_PREFIX) &&
    pathname.length > UPLOAD_PREFIX.length &&
    !pathname.slice(UPLOAD_PREFIX.length).includes("/") &&
    !pathname.includes("..")
  );
}

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed." }, { status: 405 });
    }

    const expectedPassword = process.env.TELEUPLOAD_PASSWORD;
    if (!expectedPassword || !process.env.BLOB_READ_WRITE_TOKEN) {
      return Response.json(
        { error: "TeleUpload storage is not configured yet." },
        { status: 503 },
      );
    }

    let data;
    try {
      data = await request.json();
    } catch {
      return Response.json({ error: "Invalid request." }, { status: 400 });
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return Response.json({ error: "Invalid request." }, { status: 400 });
    }
    if (!passwordMatches(data.password, expectedPassword)) {
      return Response.json({ error: "Password is incorrect." }, { status: 401 });
    }
    if (!validUploadPath(data.pathname)) {
      return Response.json({ error: "Invalid upload reference." }, { status: 400 });
    }

    if (data.action === "cleanup") {
      try {
        await del(data.pathname, { access: "private" });
        return Response.json({ ok: true });
      } catch {
        return Response.json({ error: "Temporary file cleanup failed." }, { status: 502 });
      }
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
      return Response.json(
        { error: "Telegram is not configured yet." },
        { status: 503 },
      );
    }

    try {
      const stored = await get(data.pathname, { access: "private" });
      if (!stored || stored.statusCode !== 200 || !stored.stream) {
        return Response.json({ error: "Uploaded file was not found." }, { status: 404 });
      }

      const bytes = await new Response(stored.stream).arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > MAX_FILE_SIZE) {
        return Response.json(
          { error: "Each file must be 50 MB or smaller for Telegram." },
          { status: 413 },
        );
      }

      const filename =
        typeof data.filename === "string"
          ? data.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180)
          : "upload";
      const telegramForm = new FormData();
      telegramForm.append("chat_id", chatId);
      telegramForm.append(
        "caption",
        typeof data.title === "string" ? data.title.trim().slice(0, 1024) : "",
      );
      telegramForm.append(
        "document",
        new Blob([bytes], {
          type: stored.blob.contentType || "application/octet-stream",
        }),
        filename || "upload",
      );

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
        { error: "Could not send this file to Telegram." },
        { status: 502 },
      );
    } finally {
      try {
        await del(data.pathname, { access: "private" });
      } catch {
        console.error("Could not delete a temporary TeleUpload blob.");
      }
    }
  },
};
