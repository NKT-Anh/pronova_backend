import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((response) => {
        if (
          response &&
          typeof response === 'object' &&
          'success' in response &&
          'message' in response
        ) {
          return response as ApiResponse<T>;
        }

        return {
          success: true,
          message: this.getDefaultMessage(context),
          data: response,
        };
      }),
    );
  }

  private getDefaultMessage(context: ExecutionContext): string {
    const method = context.switchToHttp().getRequest().method;

    switch (method) {
      case 'POST':
        return 'Created successfully';
      case 'PATCH':
      case 'PUT':
        return 'Updated successfully';
      case 'DELETE':
        return 'Deleted successfully';
      default:
        return 'Fetched successfully';
    }
  }
}
