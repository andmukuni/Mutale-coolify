import { useCallback, useRef, useState } from "react";
import { ConfirmDialog } from "../../ui";

// Promise-based replacement for window.confirm that renders the shared
// ConfirmDialog. Usage: `if (await confirm({ message })) doThing();`
export default function useCampaignConfirm() {
  const [options, setOptions] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback(
    (next) =>
      new Promise((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setOptions(next);
      }),
    [],
  );

  const settle = (result) => {
    resolver.current?.(result);
    resolver.current = null;
    setOptions(null);
  };

  const dialog = (
    <ConfirmDialog
      isOpen={Boolean(options)}
      onClose={() => settle(false)}
      onConfirm={() => settle(true)}
      title={options?.title || "Please confirm"}
      message={options?.message}
      confirmLabel={options?.confirmLabel || "Confirm"}
      cancelLabel={options?.cancelLabel || "Cancel"}
      variant={options?.variant || "primary"}
    />
  );

  return [confirm, dialog];
}
