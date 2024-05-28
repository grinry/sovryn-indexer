import config from 'config';
import { ErrorResponse, ErrorType, ErrorValidation } from 'types';

export class CustomError extends Error {
  private httpStatusCode: number;
  private errorType: ErrorType;
  private errors: string[] | null;
  private errorRaw: any;
  private errorsValidation: ErrorValidation[] | null;

  constructor(
    httpStatusCode: number,
    errorType: ErrorType,
    message: string,
    errors: string[] | null = null,
    errorRaw: any = null,
    errorsValidation: ErrorValidation[] | null = null,
  ) {
    super(message);

    this.name = this.constructor.name;

    if (errorRaw?.isAxiosError) {
      errors = [errorRaw.response?.data];
    }

    this.httpStatusCode = httpStatusCode;
    this.errorType = errorType;
    this.errors = errors;
    this.errorRaw = errorRaw;
    this.errorsValidation = errorsValidation;
  }

  get HttpStatusCode() {
    return this.httpStatusCode;
  }

  get JSON(): ErrorResponse {
    if (config.env === 'development') {
      return {
        type: this.errorType,
        error: this.message,
        errors: this.errors,
        errorRaw: this.errorRaw,
        errorsValidation: this.errorsValidation,
        stack: this.stack,
      };
    }

    return {
      type: this.errorType,
      error: this.message,
      errors: this.errors || undefined,
    };
  }
}

export class ValidationError extends CustomError {
  constructor(error: string | string[], fields: string[] | null = null) {
    const errors = Array.isArray(error) ? error : [error];
    super(422, 'Validation', errors.length ? errors[0] : 'Unknown error.', fields ? fields : errors);
  }
}

export class BadRequestError extends CustomError {
  constructor(error: string) {
    super(400, 'General', error);
  }
}

export class AuthorizationError extends CustomError {
  constructor(error: string) {
    super(401, 'Unauthorized', error);
  }
}

export class ForbiddenError extends CustomError {
  constructor(error: string) {
    super(403, 'Forbidden', error);
  }
}

export class HttpError extends CustomError {
  constructor(status: number, error: string) {
    super(status, 'General', error);
  }
}
