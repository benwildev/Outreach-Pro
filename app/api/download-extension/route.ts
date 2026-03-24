import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import archiver from "archiver";
import { Readable } from "stream";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const extensionDir = path.join(process.cwd(), "extension");

    if (!fs.existsSync(extensionDir)) {
      return NextResponse.json({ error: "Extension directory not found" }, { status: 404 });
    }

    const chunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      const archive = archiver("zip", { zlib: { level: 6 } });

      archive.on("data", (chunk: Buffer) => chunks.push(chunk));
      archive.on("end", resolve);
      archive.on("error", reject);

      archive.directory(extensionDir, false);
      archive.finalize();
    });

    const zipBuffer = Buffer.concat(chunks);

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="benwill-outreach-extension.zip"',
        "Content-Length": String(zipBuffer.byteLength),
      },
    });
  } catch (error) {
    console.error("Error creating extension zip:", error);
    return NextResponse.json({ error: "Failed to create extension zip" }, { status: 500 });
  }
}
