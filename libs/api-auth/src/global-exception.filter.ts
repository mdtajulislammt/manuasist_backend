import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

type ErrorBody = {
  statusCode: number;
  timestamp: string;
  path: string;
  method: string;
  error: string;
  message: string | string[];
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // If there is no HTTP response context, bubble up.
    if (!response || typeof response.status !== 'function') {
      throw exception;
    }

    const statusCode = this.resolveStatusCode(exception);
    const { message, error } = this.resolveMessageAndError(exception, statusCode);

    const body: ErrorBody = {
      statusCode,
      timestamp: new Date().toISOString(),
      path: request?.url ?? '',
      method: request?.method ?? '',
      error,
      message,
    };

    const context = `${body.method} ${body.path} -> ${statusCode}`;
    if (statusCode >= 500) {
      this.logger.error(context, exception instanceof Error ? exception.stack : undefined);
    } else {
      this.logger.warn(`${context}: ${Array.isArray(message) ? message.join(', ') : message}`);
    }

    response.status(statusCode).json(body);
  }

  private resolveStatusCode(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private resolveMessageAndError(
    exception: unknown,
    statusCode: number,
  ): { message: string | string[]; error: string } {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'string') {
        return {
          message: response,
          error: exception.name,
        };
      }
      if (typeof response === 'object' && response !== null) {
        const maybeMessage = (response as { message?: unknown }).message;
        const maybeError = (response as { error?: unknown }).error;
        return {
          message:
            typeof maybeMessage === 'string' || Array.isArray(maybeMessage)
              ? (maybeMessage as string | string[])
              : exception.message,
          error: typeof maybeError === 'string' ? maybeError : exception.name,
        };
      }
      return { message: exception.message, error: exception.name };
    }

    if (exception instanceof Error) {
      return {
        message:
          statusCode >= 500 ? 'Internal server error' : exception.message,
        error: exception.name,
      };
    }

    return {
      message: 'Internal server error',
      error: 'Error',
    };
  }
}
