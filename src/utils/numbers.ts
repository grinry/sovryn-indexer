import { bignumber, BigNumber, format } from 'mathjs';

import { DECIMAL_PLACES } from 'config/constants';

export const prettyNumber = (value: string | number | BigNumber, decimalPlaces = DECIMAL_PLACES): string => {
  value = bignumber(value);
  if (value.isNaN() || !value.isFinite()) {
    value = bignumber(0);
  }

  return format(bignumber(value).toDecimalPlaces(decimalPlaces), { notation: 'fixed' });
};
