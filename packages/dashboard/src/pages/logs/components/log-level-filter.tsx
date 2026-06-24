import { ChevronDown } from 'lucide-react';

import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { Label } from '../../../components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/popover';
import type { LogLevel } from '../../../types/dashboard';

const logLevels: LogLevel[] = ['info', 'warn', 'error'];

export function LogLevelFilter({
  selectedLevels,
  onChange,
}: {
  selectedLevels: LogLevel[];
  onChange: (levels: LogLevel[]) => void;
}) {
  const label =
    selectedLevels.length === logLevels.length ? 'All levels' : `${selectedLevels.length} levels`;

  const toggleLevel = (level: LogLevel, checked: boolean) => {
    if (checked) {
      onChange([...selectedLevels, level].sort(sortLogLevels));
      return;
    }

    onChange(selectedLevels.filter((item) => item !== level));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="w-[180px] justify-between">
          {label}
          <ChevronDown className="size-4 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[180px]">
        <div className="flex flex-col gap-3">
          {logLevels.map((level) => (
            <Label key={level} className="flex cursor-pointer items-center gap-2 font-normal">
              <Checkbox
                className="cursor-pointer"
                checked={selectedLevels.includes(level)}
                onCheckedChange={(checked) => toggleLevel(level, checked === true)}
              />
              <span className="cursor-pointer">{level}</span>
            </Label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function sortLogLevels(left: LogLevel, right: LogLevel) {
  return logLevels.indexOf(left) - logLevels.indexOf(right);
}
