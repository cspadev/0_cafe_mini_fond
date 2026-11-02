import type { ReactNode } from 'react';

/** Deployed (production) builds of the dev tools show the parameters but cannot edit them. */
export const READ_ONLY: boolean = import.meta.env.PROD;

/** Disables every control inside when READ_ONLY (native fieldset behaviour, also blocks keyboard input). */
export function Lock({ children }: { children: ReactNode }) {
  return (
    <fieldset disabled={READ_ONLY} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      {children}
    </fieldset>
  );
}
