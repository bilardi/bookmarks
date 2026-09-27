import type { ReactNode } from "react";

import { navigate } from "../router";

// An ordinary anchor, so the address is real and shareable, without the reload.
export function Link({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  return (
    <a
      href={to}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
