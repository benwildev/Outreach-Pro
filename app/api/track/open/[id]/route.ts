import { prisma } from "@/lib/prisma";

const PIXEL_BASE64 = "R0lGODlhAQABAAAAACwAAAAAAQABAAA=";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  await prisma.lead.update({
    where: { id },
    data: {
      opened: true,
      openedAt: new Date(),
    },
  }).catch(() => null);

  const pixel = Buffer.from(PIXEL_BASE64, "base64");
  return new Response(pixel, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, private",
    },
  });
}
