import Joi from 'joi';

import { CustomError } from './custom-error';

export type ValidateReturn = Joi.ValidationResult | null;

export const validate = (validator: Joi.Schema, data: unknown): ValidateReturn => {
  const result = validator.validate(data);
  if (result.error) {
    throw new CustomError(
      422,
      'Validation',
      result.error.message,
      result.error.details.map((detail) => detail.message),
    );
  }
  return result.error ? result : null;
};
