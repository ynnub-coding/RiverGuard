import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "@/lib/classnames";

const toneClasses = {
  canvas: "bg-canvas-soft text-ink",
  smoke: "bg-smoke text-white",
  analysis: "bg-analysis text-canvas-soft",
  outline: "border border-line bg-transparent text-ink",
};

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: "compact" | "default" | "spacious";
  tone?: keyof typeof toneClasses;
}

const paddingClasses = {
  compact: "p-4",
  default: "p-6",
  spacious: "p-8",
};

export function Panel({
  children,
  className,
  padding = "default",
  tone = "canvas",
  ...props
}: PanelProps) {
  return (
    <div
      {...props}
      className={cx(
        "rounded-panel",
        toneClasses[tone],
        paddingClasses[padding],
        className,
      )}
    >
      {children}
    </div>
  );
}
