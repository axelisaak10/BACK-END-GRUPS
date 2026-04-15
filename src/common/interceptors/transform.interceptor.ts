import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ResponseWrapper<T> {
  statusCode: number;
  intOpCode: string;
  data: T;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ResponseWrapper<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ResponseWrapper<T>> {
    const response = context.switchToHttp().getResponse();
    const statusCode = response.statusCode as number;

    return next.handle().pipe(
      map((data: T) => ({
        statusCode,
        intOpCode: `microservicio-groups${statusCode}`,
        data,
      })),
    );
  }
}
