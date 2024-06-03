export type ErrorResponse = {
  type: ErrorType;
  error: string;
} & Partial<{
  errors: string[] | null;
  errorRaw: any;
  errorsValidation: ErrorValidation[] | null;
  stack?: string;
}>;

export type ErrorType = 'General' | 'Raw' | 'Validation' | 'Unauthorized' | 'Forbidden';

export type ErrorValidation = { [key: string]: string };
