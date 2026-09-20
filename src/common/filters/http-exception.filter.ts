import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ErrorCodes } from '../errors/error-codes';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code: string = ErrorCodes.INTERNAL_ERROR;
    let errors: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res: any = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        message = res.message || exception.message;
        code = res.code || (status === 401 ? ErrorCodes.AUTH_INVALID : status === 403 ? ErrorCodes.FORBIDDEN : status === 404 ? 'NOT_FOUND' : ErrorCodes.VALIDATION_ERROR);
        if (Array.isArray(res.message)) {
          errors = res.message;
          message = res.message.join(', ');
          code = ErrorCodes.VALIDATION_ERROR;
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`Unhandled Exception: ${exception.message}`, exception.stack);
    }

    response.status(status).json({
      success: false,
      message,
      code,
      ...(errors ? { errors } : {}),
    });
  }
}
