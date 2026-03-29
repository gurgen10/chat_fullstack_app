import { resolveApiUrl } from "../lib/api";

type Props = {
  displayName: string;
  avatarUrl?: string | null;
  /** Bust browser cache after upload */
  cacheKey?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeClass: Record<NonNullable<Props["size"]>, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-11 w-11 text-base",
};

export function UserAvatar({
  displayName,
  avatarUrl,
  cacheKey,
  size = "md",
  className = "",
}: Props) {
  const initial = displayName.trim().slice(0, 1).toUpperCase() || "?";
  const src =
    avatarUrl != null && avatarUrl !== ""
      ? `${resolveApiUrl(avatarUrl)}${cacheKey != null ? `?v=${cacheKey}` : ""}`
      : undefined;

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-600 font-semibold text-white ring-2 ring-slate-700 ${sizeClass[size]} ${className}`}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        initial
      )}
    </span>
  );
}
