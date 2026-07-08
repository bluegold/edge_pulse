type LocalTimeProps = {
  iso: string | null | undefined;
  class?: string;
  seconds?: boolean;
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

export const formatLocalDateTimeWithoutSeconds = (value: Date): string => {
  const year = String(value.getFullYear()).padStart(4, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
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

const formatFallback = (iso: string, seconds: boolean): string =>
  seconds ? formatLocalDateTime(new Date(iso)) : formatLocalDateTimeWithoutSeconds(new Date(iso));

export const LocalTime = ({ iso, class: className, seconds = true }: LocalTimeProps) => {
  if (!iso) return <span>-</span>;

  return (
    <time
      class={["tabular-nums whitespace-nowrap", className].filter(Boolean).join(" ")}
      datetime={iso}
      data-utc-time={iso}
      data-utc-seconds={seconds ? "true" : "false"}
      title={iso}
    >
      {formatFallback(iso, seconds)}
    </time>
  );
};
