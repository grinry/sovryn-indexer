import { Dayjs } from 'dayjs';

export type Interval = {
  baseId: number;
  quoteId: number;
  date: Dayjs;
  value: number;
};
