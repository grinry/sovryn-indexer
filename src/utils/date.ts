const DEFAULT_DATE_FLOOR = 1;

// Rounds a date down to the nearest minute
export function floorDate(date: Date, minutes = DEFAULT_DATE_FLOOR) {
  const ms = 1000 * 60 * minutes; // convert minutes to ms
  const roundedDate = new Date(Math.floor(date.getTime() / ms) * ms);
  return roundedDate;
}

// Rounds a date up to the nearest minute
export function ceilDate(date: Date, minutes = DEFAULT_DATE_FLOOR) {
  const ms = 1000 * 60 * minutes; // convert minutes to ms
  const roundedDate = new Date(Math.ceil(date.getTime() / ms) * ms);
  return roundedDate;
}
