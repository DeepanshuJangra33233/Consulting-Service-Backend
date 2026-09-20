import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../types';

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((response) => {
        // If response is already formatted as ApiResponse (e.g. has success property), return directly
        if (response && typeof response === 'object' && 'success' in response) {
          return response;
        }

        // If response has { data, message } or is plain payload
        if (response && typeof response === 'object' && 'data' in response) {
          return {
            success: true,
            data: response.data,
            message: response.message || 'Operation successful',
          };
        }

        return {
          success: true,
          data: response,
          message: 'Operation successful',
        };
      }),
    );
  }
}
