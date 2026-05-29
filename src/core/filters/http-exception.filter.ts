import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    const message = this.resolveMessage(exception, exceptionResponse);

    response.status(status).json({
      success: false,
      message,
      error: exceptionResponse ?? {
        name:
          exception instanceof Error
            ? exception.name
            : 'InternalServerError',
      },
    });
  }

  private resolveMessage(
    exception: unknown,
    exceptionResponse: string | object | null,
  ): string {
    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    if (
      exceptionResponse &&
      typeof exceptionResponse === 'object' &&
      'message' in exceptionResponse
    ) {
      const message = exceptionResponse.message;
      return Array.isArray(message) ? message.join(', ') : String(message);
    }

    if (exception instanceof Error) {
      return exception.message || 'Internal server error';
    }

    return 'Internal server error';
  }
}
