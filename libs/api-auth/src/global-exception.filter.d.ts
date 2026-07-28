import { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
export type ApiErrorBody = {
    success: false;
    message: string;
    status: number;
};
export declare class GlobalExceptionFilter implements ExceptionFilter {
    private readonly logger;
    catch(exception: unknown, host: ArgumentsHost): void;
    private resolveStatusCode;
    private resolveMessage;
}
