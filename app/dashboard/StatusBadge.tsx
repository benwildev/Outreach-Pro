import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusVariants = {
  pending: "pending" as const,
  sent: "sent" as const,
  scheduled: "scheduled" as const,
  replied: "replied" as const,
};

type LeadStatus = keyof typeof statusVariants;

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const variant =
    statusVariants[status.toLowerCase() as LeadStatus] ?? "pending";
  return (
    <Badge
      variant={variant}
      className={cn("capitalize", className)}
    >
      {status}
    </Badge>
  );
}
