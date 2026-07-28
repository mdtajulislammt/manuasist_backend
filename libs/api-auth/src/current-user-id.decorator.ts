import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { MenuAssistJwtPayload } from './jwt-payload';

export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const req = ctx
      .switchToHttp()
      .getRequest<{ user?: MenuAssistJwtPayload }>();
    return req.user?.sub;
  },
);
