import dayjs from 'dayjs';

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

export type NearestType = 'minute' | 'hour' | 'day';

export function toNearestDate(date: Date, type: NearestType) {
  switch (type) {
    case 'minute':
      return dayjs(date).startOf('minute').toDate();
    case 'hour':
      return dayjs(date).startOf('hour').toDate();
    case 'day':
      return dayjs(date).startOf('day').toDate();
  }
}

export function toNearestCeilDate(date: Date, type: NearestType) {
  switch (type) {
    case 'minute':
      return dayjs(date).add(1, 'minute').startOf('minute').toDate();
    case 'hour':
      return dayjs(date).add(1, 'hour').startOf('hour').toDate();
    case 'day':
      return dayjs(date).add(1, 'hour').startOf('day').toDate();
  }
}
