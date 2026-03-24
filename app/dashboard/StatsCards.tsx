import { Mail, CheckCircle2, Clock, AlertCircle, XCircle } from "lucide-react";

interface StatsCardsProps {
  totalLeads: number;
  sentLeads: number;
  repliedLeads: number;
  pendingLeads: number;
  bouncedLeads: number;
  followupDueCount: number;
}

export function StatsCards({
  totalLeads,
  sentLeads,
  repliedLeads,
  pendingLeads,
  bouncedLeads,
  followupDueCount,
}: StatsCardsProps) {
  const deliveredLeads = sentLeads + repliedLeads + bouncedLeads;
  const replyRate =
    deliveredLeads > 0 ? Math.round((repliedLeads / deliveredLeads) * 100) : null;
  const bounceRate =
    deliveredLeads > 0 ? Math.round((bouncedLeads / deliveredLeads) * 100) : null;

  const stats = [
    {
      label: "Total Leads",
      value: totalLeads,
      sub: null,
      icon: Mail,
      color: "bg-blue-500",
      lightColor: "bg-blue-50",
      textColor: "text-blue-600",
    },
    {
      label: "Sent",
      value: sentLeads,
      sub: replyRate !== null ? `${replyRate}% replied` : null,
      subColor: "text-emerald-600",
      icon: CheckCircle2,
      color: "bg-green-500",
      lightColor: "bg-green-50",
      textColor: "text-green-600",
    },
    {
      label: "Replied",
      value: repliedLeads,
      sub: replyRate !== null ? `${replyRate}% reply rate` : null,
      subColor: "text-emerald-600",
      icon: CheckCircle2,
      color: "bg-emerald-500",
      lightColor: "bg-emerald-50",
      textColor: "text-emerald-600",
    },
    {
      label: "Bounced",
      value: bouncedLeads,
      sub: bounceRate !== null ? `${bounceRate}% bounce rate` : null,
      subColor: "text-red-500",
      icon: XCircle,
      color: "bg-red-500",
      lightColor: "bg-red-50",
      textColor: "text-red-600",
    },
    {
      label: "Pending",
      value: pendingLeads,
      sub: null,
      icon: Clock,
      color: "bg-yellow-500",
      lightColor: "bg-yellow-50",
      textColor: "text-yellow-600",
    },
    {
      label: "Follow-ups Due",
      value: followupDueCount,
      sub: null,
      icon: AlertCircle,
      color: "bg-orange-500",
      lightColor: "bg-orange-50",
      textColor: "text-orange-600",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6 animate-slideUp">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <div
            key={index}
            style={{ animationDelay: `${index * 50}ms` }}
            className={`${stat.lightColor} rounded-lg p-4 border border-gray-200 shadow-sm hover:shadow-md transition-all duration-300 transform hover:-translate-y-1 animate-slideUp`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-600">{stat.label}</p>
                <p className={`text-2xl font-bold ${stat.textColor} mt-1`}>
                  {stat.value}
                </p>
                {stat.sub && (
                  <p className={`text-[10px] font-medium mt-0.5 ${(stat as { subColor?: string }).subColor ?? "text-gray-500"}`}>
                    {stat.sub}
                  </p>
                )}
              </div>
              <div className={`${stat.color} p-3 rounded-lg shadow-md`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
