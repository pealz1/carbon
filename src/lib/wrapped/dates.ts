// Hours, days and months as the story names them, in the system's own formats (as the recap does).
import { dateOfDay } from "$lib/history/entries";

const format = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, options);
const hours = format({ hour: "numeric" });
const weekdays = format({ weekday: "long" });
const months = { long: format({ month: "long" }), narrow: format({ month: "narrow" }) };
const days = format({ day: "numeric", month: "long" });
const moments = format({ day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });

export const hourName = (hour: number): string => hours.format(new Date(2024, 0, 1, hour));
/** 0 is Sunday: 7 January 2024 was one. */
export const weekdayName = (weekday: number): string => weekdays.format(new Date(2024, 0, 7 + weekday));
/** 0 is January. */
export const monthName = (month: number, style: "long" | "narrow" = "long"): string => months[style].format(new Date(2024, month, 1));
/** A day number (see `dayOf`) as "14 March". */
export const dayName = (day: number): string => days.format(dateOfDay(day));
export const momentName = (at: number): string => moments.format(at);
