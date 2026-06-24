import type { Icon } from '../../types/dashboard';

export function EmptyState({
  icon: IconComponent,
  title,
  description,
}: {
  icon: Icon;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
      <IconComponent className="size-7 text-muted-foreground" aria-hidden="true" />
      <h2 className="mt-3 font-medium text-sm">{title}</h2>
      {description == null ? null : (
        <p className="mt-1 max-w-[320px] text-muted-foreground text-xs">{description}</p>
      )}
    </div>
  );
}
