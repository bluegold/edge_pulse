export const formatNullable = (value: string | number | null | undefined, fallback = "-"): string => {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
};

export const isPlatformFetchError = (reason: string | null | undefined, error: string | null | undefined): boolean => {
  return reason === "fetch_error" && typeof error === "string" && error.includes("internal error; reference =");
};
