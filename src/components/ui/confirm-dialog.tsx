"use client";

import * as React from "react";
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";

import { cn } from "@/lib/utils";
import { Button, type buttonVariants } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";

type ConfirmOptions = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: VariantProps<typeof buttonVariants>["variant"];
};

type ConfirmState = ConfirmOptions & {
  open: boolean;
  resolve: (value: boolean) => void;
};

const defaultState: ConfirmState = {
  open: false,
  resolve: () => {},
};

const ConfirmContext = React.createContext<
  ((options: ConfirmOptions) => Promise<boolean>) | null
>(null);

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<ConfirmState>(defaultState);

  const confirm = React.useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...options, open: true, resolve });
    });
  }, []);

  const settle = React.useCallback(
    (value: boolean) => {
      state.resolve(value);
      setState((prev) => ({ ...prev, open: false }));
    },
    [state]
  );

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialogPrimitive.Root
        open={state.open}
        onOpenChange={(open) => {
          if (!open) settle(false);
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
            </div>
            <div className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => settle(false)}>
                {state.cancelText ?? "Abbrechen"}
              </Button>
              <Button variant={state.variant ?? "default"} onClick={() => settle(true)}>
                {state.confirmText ?? "Bestätigen"}
              </Button>
            </div>
          </AlertDialogPrimitive.Popup>
        </AlertDialogPrimitive.Portal>
      </AlertDialogPrimitive.Root>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const confirm = React.useContext(ConfirmContext);
  if (!confirm) {
    throw new Error("useConfirm must be used within a ConfirmDialogProvider");
  }
  return confirm;
}
