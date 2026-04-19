import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

/**
 * Runs JWT verification first, then RBAC — avoids ambiguous ordering with multiple APP_GUARD entries.
 */
@Injectable()
export class CompositeAuthGuard implements CanActivate {
  constructor(
    private readonly jwtAuthGuard: JwtAuthGuard,
    private readonly rolesGuard: RolesGuard,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const jwtOk = await this.jwtAuthGuard.canActivate(context);
    if (!jwtOk) {
      return false;
    }
    return this.rolesGuard.canActivate(context);
  }
}
