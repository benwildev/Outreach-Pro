import { prisma } from "@/lib/prisma";

/**
 * Silently promotes any "scheduled" leads whose scheduled delivery time
 * (stored as sentAt) has already passed to "sent".
 * Call this at the start of any server action or API route that reads lead data
 * so the dashboard always reflects the true delivered state.
 */
export async function promoteScheduledLeads(): Promise<void> {
  try {
    await prisma.lead.updateMany({
      where: {
        status: "scheduled",
        sentAt: { lte: new Date() },
      },
      data: { status: "sent" },
    });
  } catch {
    // Non-fatal — log but never crash the calling route
  }
}
