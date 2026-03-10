import * as dayjs from 'dayjs';
import { TZGT } from './utils';

export const formattShortFecha = (value: string | Date): string => {
  return dayjs(value).tz(TZGT).format('DD/MM/YYYY');
};

export const formattFechaWithMinutes = (value: string | Date): string => {
  return dayjs(value).tz(TZGT).format('DD/MM/YYYY hh:mm a');
};
