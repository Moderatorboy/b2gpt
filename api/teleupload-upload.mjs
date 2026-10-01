import { handleUpload } from "@vercel/blob/client";

const MAX_FILE_SIZE = 50 * 1024 * 1024;

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed." }, { status: 405 });
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return Response.json(
        { error: "Private Vercel Blob storage is not configured yet." },
        { status: 503 },
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid upload request." }, { status: 400 });
    }
    const isTokenRequest =
      body?.type === "blob.generate-client-token" &&
      typeof body.payload?.pathname === "string";
    const isUploadCompleted = body?.type === "blob.upload-completed";
    if (!isTokenRequest && !isUploadCompleted) {
      return Response.json({ error: "Invalid upload request." }, { status: 400 });
    }

    try {
      const result = await handleUpload({
        body,
        request,
        onBeforeGenerateToken: async (pathname) => {
          if (!pathname.startsWith("teleupload/") || pathname.includes("..")) {
            throw new Error("Invalid upload path.");
          }

          return {
            maximumSizeInBytes: MAX_FILE_SIZE,
            validUntil: Date.now() + 10 * 60 * 1000,
            addRandomSuffix: true,
          };
        },
        onUploadCompleted: async () => {},
      });
      return Response.json(result);
    } catch {
      return Response.json(
        { error: "Could not prepare the private upload. Check Vercel Blob storage setup." },
        { status: 400 },
      );
    }
  },
};