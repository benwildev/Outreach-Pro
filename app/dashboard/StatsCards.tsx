import { Mail, CheckCircle2, MessageSquare, Clock, AlertCircle, XCircle, CalendarClock, AlertTriangle } from "lucide-react";
import Link from "next/link";

interface StatsCardsProps {
  totalLeads: number;
  sentLeads: number;
  repliedLeads: number;
  pendingLeads: number;
  bouncedLeads: number;
  scheduledLeads: number;
  failedLeads: number;
  followupDueCount: number;
}

export function StatsCards({
  totalLeads,
  sentLeads,
  repliedLeads,
  pendingLeads,
  bouncedLeads,
  scheduledLeads,
  failedLeads,
  followupDueCount,
}: StatsCardsProps) {
  const deliveredLeads = sentLeads + repliedLeads + bouncedLeads;
  const replyRate = deliveredLeads > 0 ? Math.round((repliedLeads / deliveredLeads) * 100) : null;
  const bounceRate = deliveredLeads > 0 ? Math.round((bouncedLeads / deliveredLeads) * 100) : null;

  const stats = [
    {
      label: "Total Leads",
      value: totalLeads,
      sub: null,
      icon: Mail,
      accent: "border-l-blue-500",
      iconBg: "bg-blue-500",
      valueColor: "text-blue-700",
      href: "/dashboard",
    },
    {
      label: "Sent",
      value: sentLeads,
      sub: replyRate !== null ? `${replyRate}% reply rate` : "0 sent yet",
      subColor: "text-slate-500",
      icon: CheckCircle2,
      accent: "border-l-emerald-500",
      iconBg: "bg-emerald-500",
      valueColor: "text-emerald-700",
      href: "/dashboard?status=sent",
    },
    {
      label: "Scheduled",
      value: scheduledLeads,
      sub: "awaiting delivery",
      subColor: "text-amber-600",
      icon: CalendarClock,
      accent: "border-l-amber-400",
      iconBg: "bg-amber-400",
      valueColor: "text-amber-700",
      href: "/dashboard?status=scheduled",
    },
    {
      label: "Replied",
      value: repliedLeads,
      sub: replyRate !== null ? `${replyRate}% of delivered` : null,
      subColor: "text-indigo-500",
      icon: MessageSquare,
      accent: "border-l-indigo-500",
      iconBg: "bg-indigo-500",
      valueColor: "text-indigo-700",
      href: "/dashboard?status=replied",
    },
    {
      label: "Bounced",
      value: bouncedLeads,
      sub: bounceRate !== null ? `${bounceRate}% bounce rate` : null,
      subColor: "text-red-500",
      icon: XCircle,
      accent: "border-l-red-500",
      iconBg: "bg-red-500",
      valueColor: "text-red-700",
      href: "/dashboard?status=bounced",
    },
    {
      label: "Failed",
      value: failedLeads,
      sub: failedLeads > 0 ? "retry from bulk panel" : "none stuck",
      subColor: failedLeads > 0 ? "text-rose-600" : "text-slate-400",
      icon: AlertTriangle,
      accent: failedLeads > 0 ? "border-l-rose-500" : "border-l-gray-300",
      iconBg: failedLeads > 0 ? "bg-rose-500" : "bg-gray-400",
      valueColor: failedLeads > 0 ? "text-rose-700" : "text-gray-500",
      href: "/dashboard?status=failed",
    },
    {
      label: "Pending",
      value: pendingLeads,
      sub: "queued to send",
      subColor: "text-amber-600",
      icon: Clock,
      accent: "border-l-amber-500",
      iconBg: "bg-amber-500",
      valueColor: "text-amber-700",
      href: "/dashboard?status=pending",
    },
    {
      label: "Follow-ups Due",
      value: followupDueCount,
      sub: followupDueCount > 0 ? "action needed" : "all up to date",
      subColor: followupDueCount > 0 ? "text-orange-600" : "text-slate-400",
      icon: AlertCircle,
      accent: followupDueCount > 0 ? "border-l-orange-500" : "border-l-gray-300",
      iconBg: followupDueCount > 0 ? "bg-orange-500" : "bg-gray-400",
      valueColor: followupDueCount > 0 ? "text-orange-700" : "text-gray-500",
      href: "/dashboard?filter=followup-due",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-5">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <Link
            key={index}
            href={stat.href}
            className={`group bg-white rounded-xl border border-gray-200 border-l-4 ${stat.accent} shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-4 flex flex-col gap-3`}
          >
            <div className="flex items-start justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide leading-none">
                {stat.label}
              </p>
              <div className={`${stat.iconBg} rounded-lg p-1.5 shadow-sm flex-shrink-0`}>
                <Icon className="w-3.5 h-3.5 text-white" />
              </div>
            </div>
            <div>
              <p className={`text-3xl font-bold ${stat.valueColor} leading-none`}>
                {stat.value.toLocaleString()}
              </p>
              {stat.sub && (
                <p className={`text-[11px] mt-1.5 font-medium ${(stat as { subColor?: string }).subColor ?? "text-gray-400"}`}>
                  {stat.sub}
                </p>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
