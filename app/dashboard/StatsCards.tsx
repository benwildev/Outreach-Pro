import { Mail, CheckCircle2, Clock, AlertCircle } from "lucide-react";

interface StatsCardsProps {
  totalLeads: number;
  sentLeads: number;
  repliedLeads: number;
  pendingLeads: number;
  followupDueCount: number;
}

export function StatsCards({
  totalLeads,
  sentLeads,
  repliedLeads,
  pendingLeads,
  followupDueCount,
}: StatsCardsProps) {
  const stats = [
    {
      label: "Total Leads",
      value: totalLeads,
      icon: Mail,
      color: "bg-blue-500",
      lightColor: "bg-blue-50",
      textColor: "text-blue-600",
    },
    {
      label: "Sent",
      value: sentLeads,
      icon: CheckCircle2,
      color: "bg-green-500",
      lightColor: "bg-green-50",
      textColor: "text-green-600",
    },
    {
      label: "Replied",
      value: repliedLeads,
      icon: CheckCircle2,
      color: "bg-emerald-500",
      lightColor: "bg-emerald-50",
      textColor: "text-emerald-600",
    },
    {
      label: "Pending",
      value: pendingLeads,
      icon: Clock,
      color: "bg-yellow-500",
      lightColor: "bg-yellow-50",
      textColor: "text-yellow-600",
    },
    {
      label: "Follow-ups Due",
      value: followupDueCount,
      icon: AlertCircle,
      color: "bg-red-500",
      lightColor: "bg-red-50",
      textColor: "text-red-600",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6 animate-slideUp">
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
