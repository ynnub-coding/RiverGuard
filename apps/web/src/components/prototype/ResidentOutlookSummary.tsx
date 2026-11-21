"use client";

/**
 * Plain-language translation of the seven-day outlook for residents.
 *
 * The charts are kept for completeness, but they are not something a resident
 * needs to decode before knowing the headline answer: is it likely to flood
 * today? Every line here is derived from the same stored model output the
 * charts draw, and every line says so. Nothing here is an official advisory —
 * PAGASA and the LGU remain the authority, and the card says that out loud.
 */

import { Info, ShieldCheck, Warning } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { formatProbability } from "@/lib/probability";
import type { OutlookDay } from "@/types";
import type { OutlookSnapshot } from "@/lib/outlook";

type Verdict = {
  label: string;
  detail: string;
  tone: "ok" | "watch" | "danger" | "none";
};

const TONE_STYLES: Record<Verdict["tone"], string> = {
  ok: "border-[#cfe8d6] bg-[#f3faf5] text-[#196f3d]",
  watch: "border-[#e8d8b8] bg-[#fffaf0] text-[#8a6116]",
  danger: "border-[#ecc7c3] bg-[#fdf0ee] text-[#a73c36]",
  none: "border-[#d7e2e9] bg-[#f3f7fa] text-[#53697d]",
};

function verdictFor(day: OutlookDay | undefined): Verdict {
  if (!day) {
    return {
      label: "No reading for today",
      detail: "Run a forecast to see today's model estimate.",
      tone: "none",
    };
  }
  const risk = day.label;
  const probability = formatProbability(day.probability);
  if (risk === "Lower") {
    return {
      label: "Low chance of flooding",
      detail: `The model gives a ${probability} chance today. Normal precautions are enough.`,
      tone: "ok",
    };
  }
  if (risk === "Moderate") {
    return {
      label: "Flooding is possible",
      detail: `The model gives a ${probability} chance today. Keep an eye on official rainfall advisories, and stay away from fast-moving runoff.`,
      tone: "watch",
    };
  }
  if (risk === "Elevated") {
    return {
      label: "High chance of flooding",
      detail: `The model gives a ${probability} chance today. Follow official LGU and PAGASA instructions first; they're the only authority for evacuation.`,
      tone: "danger",
    };
  }
  return {
    label: "No reading available",
    detail: "The model could not score today. Check official sources.",
    tone: "none",
  };
}

function chipLabel(day: OutlookDay): string {
  const probability = formatProbability(day.probability);
  if (day.label === "Lower") return `Low · ${probability}`;
  if (day.label === "Moderate") return `Watch · ${probability}`;
  if (day.label === "Elevated") return `High · ${probability}`;
  return "—";
}

function chipTone(day: OutlookDay): string {
  if (day.label === "Lower")
    return "text-[#196f3d] bg-[#f3faf5] border-[#cfe8d6]";
  if (day.label === "Moderate")
    return "text-[#8a6116] bg-[#fffaf0] border-[#e8d8b8]";
  if (day.label === "Elevated")
    return "text-[#a73c36] bg-[#fdf0ee] border-[#ecc7c3]";
  return "text-[#53697d] bg-[#f3f7fa] border-[#d7e2e9]";
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2 text-sm leading-6 text-[#374f63]">
      <span aria-hidden="true" className="mt-0.5 text-[#147384]">
        ·
      </span>
      <span>{children}</span>
    </li>
  );
}

export function ResidentOutlookSummary({
  snapshot,
}: {
  snapshot: OutlookSnapshot | null;
}) {
  const days = snapshot?.days ?? [];
  if (days.length === 0) return null;

  const today = days[0];
  const verdict = verdictFor(today);
  const highlighted = days.filter(
    (day) => day.label !== "Lower" && day.label !== "Unavailable",
  );

  return (
    <section
      aria-labelledby="resident-outlook-summary-title"
      className="mt-4 grid gap-4 lg:grid-cols-5"
    >
      {/* The headline answer, first */}
      <div
        className={`rounded-[1.35rem] border p-5 lg:col-span-2 ${TONE_STYLES[verdict.tone]}`}
        role="status"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-80">
          Flood chance · today
        </p>
        <p
          id="resident-outlook-summary-title"
          className="mt-1 text-2xl font-semibold tracking-[-0.02em]"
        >
          {verdict.label}
        </p>
        <p className="mt-2 text-sm leading-6 opacity-90">{verdict.detail}</p>
        <p className="mt-3 flex items-start gap-2 text-xs leading-5 opacity-80">
          <Info size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
          Experimental model estimate, not an official advisory. Follow PAGASA
          and your LGU first.
        </p>
      </div>

      {/* How to read the numbers, in order */}
      <div className="rounded-[1.35rem] border border-line bg-canvas p-5 lg:col-span-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-secondary">
          How to read this
        </p>
        <ul className="mt-2 grid gap-1.5">
          <Bullet>
            <strong>Bars</strong> — how much rain the model expects each day, in
            millimetres. More rain, faster rise.
          </Bullet>
          <Bullet>
            <strong>Line</strong> — the model&apos;s derived water-level proxy
            in metres. It is not a gauge reading; treat it as a trend, not a
            depth.
          </Bullet>
          <Bullet>
            <strong>Chips below</strong> — each day&apos;s flood chance as a
            percentage based on that day&apos;s model probability.
          </Bullet>
        </ul>
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            The week at a glance
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {days.map((day) => (
              <span
                key={day.isoDate}
                title={day.isoDate}
                className={`inline-flex min-h-8 items-center rounded-full border px-2.5 text-xs font-semibold ${chipTone(day)}`}
              >
                {day.day.slice(0, 3)} {chipLabel(day)}
              </span>
            ))}
          </div>
          {highlighted.length > 0 ? (
            <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-[#8a6116]">
              <Warning
                size={13}
                aria-hidden="true"
                className="mt-0.5 shrink-0"
              />
              {highlighted.length} day{highlighted.length === 1 ? "" : "s"} in
              this window carries above-low risk. Confirm with official
              advisories.
            </p>
          ) : (
            <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-[#196f3d]">
              <ShieldCheck
                size={13}
                aria-hidden="true"
                className="mt-0.5 shrink-0"
              />
              No above-low days in this window.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
