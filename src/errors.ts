export class AppError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = this.constructor.name;
  }
}
export class NotFoundError    extends AppError { constructor(m = 'Not found')      { super(m, 404); } }
export class ConflictError    extends AppError { constructor(m = 'Already exists') { super(m, 409); } }
export class ForbiddenError   extends AppError { constructor(m = 'Forbidden')      { super(m, 403); } }
export class UnauthorizedError extends AppError { constructor(m = 'Unauthorized')  { super(m, 401); } }
export class BadRequestError  extends AppError { constructor(m = 'Bad request')    { super(m, 400); } }
