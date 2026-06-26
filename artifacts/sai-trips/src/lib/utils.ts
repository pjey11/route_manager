import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTime12h(t: string): string {
  const match = t.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!match) return t;
  let h = parseInt(match[1], 10);
  const mm = match[2];
  const suffix = match[3]?.toLowerCase();
  if (suffix === "pm" && h < 12) h += 12;
  if (suffix === "am" && h === 12) h = 0;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${mm} ${period}`;
}
