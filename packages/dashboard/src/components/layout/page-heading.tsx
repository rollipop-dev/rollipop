import type { ReactNode } from 'react';

export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className="font-semibold text-3xl text-fd-foreground md:text-4xl">{title}</h1>
        {description == null ? null : (
          <p className="max-w-[720px] text-fd-muted-foreground text-base">{description}</p>
        )}
      </div>
      {action == null ? null : <div className="shrink-0">{action}</div>}
    </section>
  );
}
