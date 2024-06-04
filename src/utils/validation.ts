import Joi, { Schema } from 'joi';

import { ValidationError } from './custom-error';

export type ValidateReturn = Joi.ValidationResult;

export const validate = <T extends object>(validator: Schema<T>, data: unknown, options?: Joi.ValidationOptions) => {
  const result = validator.validate(data, options);
  if (result.error) {
    throw new ValidationError(
      result.error.message,
      result.error.details.map((detail) => detail.message),
    );
  }
  return result.value as T;
};
