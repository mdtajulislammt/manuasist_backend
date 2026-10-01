"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var GlobalExceptionFilter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobalExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
let GlobalExceptionFilter = GlobalExceptionFilter_1 = class GlobalExceptionFilter {
    logger = new common_1.Logger(GlobalExceptionFilter_1.name);
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        if (!response || typeof response.status !== 'function') {
            throw exception;
        }
        const status = this.resolveStatusCode(exception);
        const message = this.resolveMessage(exception, status);
        const body = {
            success: false,
            message,
            status,
        };
        const context = `${request?.method ?? ''} ${request?.url ?? ''} -> ${status}`;
        if (status >= 500) {
            this.logger.error(context, exception instanceof Error ? exception.stack : undefined);
        }
        else {
            this.logger.warn(`${context}: ${message}`);
        }
        response.status(status).json(body);
    }
    resolveStatusCode(exception) {
        if (exception instanceof common_1.HttpException) {
            return exception.getStatus();
        }
        return common_1.HttpStatus.INTERNAL_SERVER_ERROR;
    }
    resolveMessage(exception, status) {
        if (exception instanceof common_1.HttpException) {
            const res = exception.getResponse();
            if (typeof res === 'string') {
                return res;
            }
            if (typeof res === 'object' && res !== null) {
                const maybeMessage = res.message;
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
};
exports.GlobalExceptionFilter = GlobalExceptionFilter;
exports.GlobalExceptionFilter = GlobalExceptionFilter = GlobalExceptionFilter_1 = __decorate([
    (0, common_1.Catch)()
], GlobalExceptionFilter);
//# sourceMappingURL=global-exception.filter.js.map