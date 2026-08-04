import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/** The "explain what's needed, don't just show blank" pattern from Phase 1's dashboard empty states, generalized for reuse. */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <Icon className="size-7 text-ink-faint" strokeWidth={1.5} />
      <p className="text-sm font-medium text-ink-primary">{title}</p>
      {description && <p className="max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
