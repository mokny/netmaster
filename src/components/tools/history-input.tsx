"use client";

import * as React from "react";
import { Autocomplete } from "@base-ui/react/autocomplete";

import { cn } from "@/lib/utils";
import { inputVariants } from "@/components/ui/input";

interface HistoryInputProps extends Omit<React.ComponentProps<"input">, "value" | "onChange"> {
  value: string;
  onValueChange: (value: string) => void;
  history: string[];
  emptyLabel: string;
}

export function HistoryInput({ value, onValueChange, history, emptyLabel, className, ...inputProps }: HistoryInputProps) {
  const { contains } = Autocomplete.useFilter({ sensitivity: "base" });

  return (
    <Autocomplete.Root
      items={history}
      value={value}
      onValueChange={onValueChange}
      filter={contains}
      openOnInputClick
    >
      <Autocomplete.Input
        {...inputProps}
        className={cn(inputVariants, className)}
      />
      <Autocomplete.Portal>
        <Autocomplete.Positioner className="isolate z-50 outline-none" side="bottom" sideOffset={4}>
          <Autocomplete.Popup className="max-h-(--available-height) w-(--anchor-width) origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <Autocomplete.Empty className="px-2 py-1.5 text-sm text-muted-foreground">
              {emptyLabel}
            </Autocomplete.Empty>
            <Autocomplete.List>
              {(item: string) => (
                <Autocomplete.Item
                  key={item}
                  value={item}
                  className="cursor-default rounded-md px-2 py-1 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  {item}
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}
