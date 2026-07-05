type LocalTimeProps = {
  iso: string | null | undefined;
  class?: string;
};

export const formatLocalDateTime = (value: Date): string => {
  const year = String(value.getFullYear()).padStart(4, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  const seconds = String(value.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

export const formatLocalDateTimeInput = (iso: string | null | undefined): string => {
  if (!iso) return "";

  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "";

  const year = String(value.getFullYear()).padStart(4, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const formatFallback = (iso: string): string => formatLocalDateTime(new Date(iso));

export const LocalTime = ({ iso, class: className }: LocalTimeProps) => {
  if (!iso) return <span>-</span>;

  return (
    <time
      class={["tabular-nums whitespace-nowrap", className].filter(Boolean).join(" ")}
      datetime={iso}
      data-utc-time={iso}
      title={iso}
    >
      {formatFallback(iso)}
    </time>
  );
};
