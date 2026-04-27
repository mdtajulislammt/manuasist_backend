import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/** Standard error envelope for all HTTP services. */
export type ApiErrorBody = {
  success: false;
  message: string;
  status: number;
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (!response || typeof response.status !== 'function') {
      throw exception;
    }

    const status = this.resolveStatusCode(exception);
    const message = this.resolveMessage(exception, status);

    const body: ApiErrorBody = {
      success: false,
      message,
      status,
    };

    const context = `${request?.method ?? ''} ${request?.url ?? ''} -> ${status}`;
    if (status >= 500) {
      this.logger.error(context, exception instanceof Error ? exception.stack : undefined);
    } else {
      this.logger.warn(`${context}: ${message}`);
    }

    response.status(status).json(body);
  }

  private resolveStatusCode(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private resolveMessage(exception: unknown, status: number): string {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        return res;
      }
      if (typeof res === 'object' && res !== null) {
        const maybeMessage = (res as { message?: unknown }).message;
        if (typeof maybeMessage === 'string') {
          return maybeMessage;
        }
        if (Array.isArray(maybeMessage)) {
          return maybeMessage.map(String).join(', ');
        }
      }
      return exception.message;
    }

    if (exception instanceof Error) {
      return status >= 500 ? 'Internal server error' : exception.message;
    }

    return 'Internal server error';
  }
}
