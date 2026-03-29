/** Violet pill for unread counts next to room/contact labels. */
export function UnreadBadge({
  count,
  className = "",
}: {
  count: number;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={`inline-flex min-h-[1.15rem] min-w-[1.15rem] shrink-0 items-center justify-center rounded-full bg-sky-700 px-1.5 text-[0.65rem] font-semibold leading-none text-white ${className}`}
      aria-label={`${count} unread`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
