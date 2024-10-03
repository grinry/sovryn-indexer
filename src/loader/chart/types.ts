import { Dayjs } from 'dayjs';

export type Interval = {
  date: Dayjs;
  value: string;
  low: string;
  high: string;
};
