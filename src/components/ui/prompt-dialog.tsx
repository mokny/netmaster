"use client";

import * as React from "react";
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PromptOptions = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
};

type PromptState = PromptOptions & {
  open: boolean;
  resolve: (value: string | null) => void;
};

const defaultState: PromptState = {
  open: false,
  resolve: () => {},
};

const PromptContext = React.createContext<
  ((options: PromptOptions) => Promise<string | null>) | null
>(null);

export function PromptDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<PromptState>(defaultState);
  const [value, setValue] = React.useState("");

  const prompt = React.useCallback((options: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      setValue(options.defaultValue ?? "");
      setState({ ...options, open: true, resolve });
    });
  }, []);

  const settle = React.useCallback(
    (result: string | null) => {
      state.resolve(result);
      setState((prev) => ({ ...prev, open: false }));
    },
    [state]
  );

  return (
    <PromptContext.Provider value={prompt}>
      {children}
      <AlertDialogPrimitive.Root
        open={state.open}
        onOpenChange={(open) => {
          if (!open) settle(null);
        }}
      >
        <AlertDialogPrimitive.Portal>
          <AlertDialogPrimitive.Backdrop
            className={cn(
              "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
            )}
          />
          <AlertDialogPrimitive.Popup
            className={cn(
              "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
            )}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                settle(value);
              }}
            >
              <div className="flex flex-col gap-2">
                {state.title && (
                  <AlertDialogPrimitive.Title className="font-heading text-base leading-none font-medium">
                    {state.title}
                  </AlertDialogPrimitive.Title>
                )}
                {state.description && (
                  <AlertDialogPrimitive.Description className="text-sm text-muted-foreground">
                    {state.description}
                  </AlertDialogPrimitive.Description>
                )}
                <div className="space-y-1.5 pt-1">
                  {state.label && <Label htmlFor="prompt-dialog-input">{state.label}</Label>}
                  <Input
                    id="prompt-dialog-input"
                    autoFocus
                    value={value}
                    placeholder={state.placeholder}
                    onChange={(e) => setValue(e.target.value)}
                  />
                </div>
              </div>
              <div className="-mx-4 -mb-4 mt-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => settle(null)}>
                  {state.cancelText ?? "Abbrechen"}
                </Button>
                <Button type="submit">{state.confirmText ?? "Bestätigen"}</Button>
              </div>
            </form>
          </AlertDialogPrimitive.Popup>
        </AlertDialogPrimitive.Portal>
      </AlertDialogPrimitive.Root>
    </PromptContext.Provider>
  );
}

export function usePrompt() {
  const prompt = React.useContext(PromptContext);
  if (!prompt) {
    throw new Error("usePrompt must be used within a PromptDialogProvider");
  }
  return prompt;
}
