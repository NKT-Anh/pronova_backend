import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, catchError, tap, throwError } from 'rxjs';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap(() => {
        this.logRequest(request, response, Date.now() - startedAt);
      }),
      catchError((error) => {
        this.logRequest(request, response, Date.now() - startedAt, error);
        return throwError(() => error);
      }),
    );
  }

  private logRequest(
    request: Request,
    response: Response,
    durationMs: number,
    error?: unknown,
  ) {
    let statusCode = response.statusCode;
    if (error) {
      if (error && typeof (error as any).getStatus === 'function') {
        statusCode = (error as any).getStatus();
      } else if (error && (error as any).status) {
        statusCode = (error as any).status;
      } else {
        statusCode = 500;
      }
    }
    const message = `${request.method} ${request.originalUrl} ${statusCode} ${durationMs}ms`;

    if (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`${message} - ${errorMessage}`);
      return;
    }

    if (statusCode >= 400) {
      this.logger.warn(message);
      return;
    }

    this.logger.log(message);
  }
}
