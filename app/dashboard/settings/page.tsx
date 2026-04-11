import Link from "next/link";
import Image from "next/image";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ArrowLeft, Shield } from "lucide-react";
import { IpAllowlistCard } from "./IpAllowlistCard";
import { GmailAccountsCard } from "./GmailAccountsCard";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [allowedIps, setting, gmailAccounts] = await Promise.all([
    prisma.allowedIp.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.appSetting.findUnique({ where: { key: "ip_restriction_enabled" } }),
    prisma.gmailAccountMap.findMany({ orderBy: { accountIndex: "asc" } }),
  ]);

  const restrictionEnabled = setting ? setting.value === "true" : false;

  const headersList = headers();
  const forwarded = headersList.get("x-forwarded-for");
  const currentVisitorIp = forwarded ? forwarded.split(",")[0].trim() : "";

  return (
    <div className="min-h-screen bg-[#f4f6fb]">
      {/* Header */}
      <header className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 shadow-xl">
        <div className="mx-auto px-6 py-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Image
                src="/logo.png"
                alt="Benwill Outreach"
                width={40}
                height={40}
                className="w-10 h-10 rounded-full object-contain bg-white/10 p-0.5"
              />
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Settings</h1>
                <p className="text-indigo-300 text-xs mt-0.5 font-medium">
                  Security &amp; access configuration
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-200 hover:text-white border border-indigo-700/60 hover:border-indigo-500 bg-indigo-900/40 hover:bg-indigo-800/60 rounded-lg px-3 py-2 transition-all duration-150"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Leads
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto px-6 py-6 max-w-4xl">
        <IpAllowlistCard
          initialIps={allowedIps.map((r) => ({
            ...r,
            createdAt: r.createdAt.toISOString(),
          }))}
          initialRestrictionEnabled={restrictionEnabled}
          currentVisitorIp={currentVisitorIp}
        />
        <GmailAccountsCard
          initialAccounts={gmailAccounts.map((r) => ({
            ...r,
            source: r.source ?? "auto",
            updatedAt: r.updatedAt.toISOString(),
          }))}
        />
      </main>
    </div>
  );
}
