import clsx from "clsx";
import type { ReactNode } from "react";
import type { Confidence } from "@/lib/types";
import { CONFIDENCE_LABELS } from "@/lib/types";

export function Card({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("rounded-xl2 bg-card border border-line shadow-card p-6", className)}>
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  subtitle
}: {
  children: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div className="mb-5">
      <h2 className="font-serif text-2xl text-ink tracking-tight">{children}</h2>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
    </div>
  );
}

export function ConfidenceBadge({ level }: { level: Confidence | undefined }) {
  const l = level ?? "UNKNOWN";
  const styles: Record<Confidence, string> = {
    VERIFIED: "bg-band-goodBg text-band-good border-band-good/30",
    ESTIMATED: "bg-band-normalBg text-band-normal border-band-normal/30",
    UNKNOWN: "bg-beige-100 text-muted border-line"
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        styles[l]
      )}
    >
      {CONFIDENCE_LABELS[l]}
    </span>
  );
}

export function Button({
  children,
  variant = "primary",
  className,
  ...rest
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles = {
    primary: "bg-ink text-paper hover:bg-ink/90 border border-ink",
    secondary: "bg-transparent text-ink border border-ink/30 hover:bg-beige-100",
    ghost: "bg-transparent text-muted hover:text-ink border border-transparent",
    danger: "bg-transparent text-band-bad border border-band-bad/30 hover:bg-band-badBg"
  };
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
        styles[variant],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Input({
  label,
  className,
  ...rest
}: { label?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">{label}</span>}
      <input
        className={clsx(
          "w-full rounded-lg border border-line bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-beige-400 focus:outline-none focus:ring-2 focus:ring-beige-200",
          className
        )}
        {...rest}
      />
    </label>
  );
}

export function Select({
  label,
  className,
  children,
  ...rest
}: { label?: string; children: ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">{label}</span>}
      <select
        className={clsx(
          "w-full rounded-lg border border-line bg-card px-3.5 py-2.5 text-sm text-ink focus:border-beige-400 focus:outline-none focus:ring-2 focus:ring-beige-200",
          className
        )}
        {...rest}
      >
        {children}
      </select>
    </label>
  );
}

export function Textarea({
  label,
  className,
  ...rest
}: { label?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">{label}</span>}
      <textarea
        className={clsx(
          "w-full rounded-lg border border-line bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-beige-400 focus:outline-none focus:ring-2 focus:ring-beige-200",
          className
        )}
        {...rest}
      />
    </label>
  );
}
