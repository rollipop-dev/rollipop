import { Card, CardContent } from '../../../components/ui/card';
import type { Icon } from '../../../types/dashboard';

export function MetricCard({
  icon: IconComponent,
  label,
  value,
  hint,
}: {
  icon: Icon;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-between gap-3">
          <p className="text-fd-muted-foreground text-sm">{label}</p>
          <IconComponent className="h-4 w-4 text-fd-muted-foreground" aria-hidden="true" />
        </div>
        <p className="mt-3 font-semibold text-3xl">{value}</p>
        <p className="mt-2 text-fd-muted-foreground text-sm">{hint}</p>
      </CardContent>
    </Card>
  );
}
