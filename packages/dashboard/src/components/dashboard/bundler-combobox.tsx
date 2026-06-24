import { ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';

import { shortId } from '../../lib/builds';
import type { BundlerInstance } from '../../types/dashboard';
import { Button } from '../ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { BundlerTargetBadges } from './bundler-target-badges';

export function BundlerCombobox({
  bundlers,
  selectedBundlerId,
  placeholder = 'Select bundler',
  searchPlaceholder = 'Search bundler...',
  emptyMessage = 'No bundler found.',
  onSelect,
}: {
  bundlers: BundlerInstance[];
  selectedBundlerId: string | null;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  onSelect: (bundlerId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel = selectedBundlerId == null ? null : shortId(selectedBundlerId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={bundlers.length === 0}
          className="w-[360px] justify-between"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-mono">{selectedLabel ?? placeholder}</span>
          </span>
          <ChevronsUpDown className="size-4 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[360px] p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                className="cursor-pointer text-muted-foreground"
                value="unselect clear none"
                data-checked={selectedBundlerId == null}
                onSelect={() => {
                  onSelect(null);
                  setOpen(false);
                }}
              >
                Unselect
              </CommandItem>
              {bundlers.map((bundler) => {
                const label = shortId(bundler.id);
                const selected = selectedBundlerId === bundler.id;

                return (
                  <CommandItem
                    key={bundler.id}
                    className="cursor-pointer"
                    value={`${label} ${bundler.id} ${bundler.platform} ${
                      bundler.dev ? 'dev' : 'prod'
                    }`}
                    data-checked={selected}
                    onSelect={() => {
                      onSelect(bundler.id);
                      setOpen(false);
                    }}
                  >
                    <span className="font-mono">{label}</span>
                    <BundlerTargetBadges platform={bundler.platform} dev={bundler.dev} />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
