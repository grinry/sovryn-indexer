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

export const validatePaginated = (data: unknown) => {
  const schema = Joi.object({
    cursor: Joi.string().optional().default(null),
    limit: Joi.number().min(1).max(1000).optional().default(100),
  });

  return validate<{ cursor: string | null; limit: number }>(schema, data, { allowUnknown: true, abortEarly: true });
};
