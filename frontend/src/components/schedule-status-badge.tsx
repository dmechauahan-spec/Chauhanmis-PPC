import { Badge } from "@/components/ui/badge";
import { SCHEDULE_STATUS_BADGE } from "@/lib/schedule-status";
import type { ScheduleStatusLabel } from "@/types/api";

export function ScheduleStatusBadge({ status }: { status: ScheduleStatusLabel }) {
  const cfg = SCHEDULE_STATUS_BADGE[status];
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
