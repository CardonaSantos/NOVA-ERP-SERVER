import * as dayjs from 'dayjs';
import 'dayjs/locale/es';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';
import * as isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import * as isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import * as customParseFormat from 'dayjs/plugin/customParseFormat';

// 1. Cargamos los plugins
dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

// 2. Configuramos el locale global
dayjs.locale('es');

// 3. (Opcional) Configura una zona horaria por defecto
// para que no dependas de la del servidor (ej. UTC o tu país)
dayjs.tz.setDefault('America/Guatemala');

// 4. Exportamos la instancia configurada
export const dateUtils = dayjs;

// También puedes exportar el tipo para usarlo en tus interfaces
export type DateInput = dayjs.ConfigType;
