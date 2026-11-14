import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatHomePathForDisplay(pathValue: string): string {
  const homePrefix =
    (/^\/Users\/[^/]+(?=\/|$)/.exec(pathValue))?.[0] ??
    (/^\/home\/[^/]+(?=\/|$)/.exec(pathValue))?.[0] ??
    (/^\/root(?=\/|$)/.exec(pathValue))?.[0] ??
    (/^[A-Za-z]:[\\/]Users[\\/][^\\/]+(?=[\\/]|$)/i.exec(pathValue))?.[0];
  return homePrefix === undefined
    ? pathValue
    : `~${pathValue.slice(homePrefix.length)}`;
}
