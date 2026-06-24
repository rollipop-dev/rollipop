import { BundlerTargetBadges } from '../../../components/dashboard/bundler-target-badges';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import { shortId } from '../../../lib/builds';
import type { BundlerInstance } from '../../../types/dashboard';

export function BundlerInstances({
  bundlers,
  onSelect,
}: {
  bundlers: BundlerInstance[];
  onSelect: (bundler: BundlerInstance) => void;
}) {
  return (
    <Card className="h-[260px] gap-0 pb-0">
      <CardHeader className="pb-4">
        <CardTitle>Bundler Instances ({bundlers.length})</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 pb-0 [&_td:first-child]:pl-0 [&_td:last-child]:pr-0 [&_th:first-child]:pl-0 [&_th:last-child]:pr-0">
        <Table containerClassName="h-full">
          <TableHeader>
            <TableRow>
              <TableHead>Id</TableHead>
              <TableHead className="w-[160px]">Target</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bundlers.map((bundler) => (
              <TableRow
                key={bundler.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(bundler)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(bundler);
                  }
                }}
                className="cursor-pointer"
              >
                <TableCell>
                  <p className="font-mono text-sm">{shortId(bundler.id)}</p>
                </TableCell>
                <TableCell>
                  <BundlerTargetBadges platform={bundler.platform} dev={bundler.dev} align="end" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
