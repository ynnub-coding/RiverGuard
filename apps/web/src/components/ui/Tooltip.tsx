import type { ReactNode } from "react";

export interface TooltipProps {
  children: ReactNode;
  content: string;
}

export function Tooltip({ children, content }: TooltipProps) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        aria-hidden="true"
        role="tooltip"
        className="text-metadata pointer-events-none absolute bottom-[calc(100%+0.5rem)] left-1/2 z-20 w-max max-w-52 -translate-x-1/2 rounded-control bg-analysis px-2.5 py-1.5 text-center text-canvas-soft opacity-0 shadow-lg transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none"
      >
        {content}
      </span>
    </span>
  );
}
