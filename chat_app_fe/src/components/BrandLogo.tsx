type Props = {
  className?: string;
  /** `compact` fits nav bars and sidebars (smaller height). */
  variant?: "default" | "compact";
};

/** Wordmark: Gug (sun) · DataArt (moon). Asset: `/public/logo.svg`. */
export function BrandLogo({ className, variant = "default" }: Props) {
  const base =
    variant === "compact"
      ? "h-8 w-auto max-w-[min(100%,17rem)] object-contain object-center"
      : "mx-auto h-10 w-auto max-w-[min(100%,22rem)] object-contain object-center";
  return (
    <img
      src="/logo.svg"
      alt="Gug DataArt"
      width={420}
      height={56}
      className={className ? `${base} ${className}` : base}
    />
  );
}
