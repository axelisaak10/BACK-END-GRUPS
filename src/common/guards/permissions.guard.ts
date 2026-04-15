import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/check-permissions.decorator';

interface GrupoPayload {
  id: string;
  nombre: string;
  permisos: string[];
}

interface JwtPayload {
  permisos_globales: string[];
  grupos: GrupoPayload[];
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload | undefined;

    console.log('[DEBUG PermissionsGuard] Requeridos:', requiredPermissions);
    console.log('[DEBUG PermissionsGuard] Usuario:', JSON.stringify({
      permisos_globales: user?.permisos_globales,
      grupos: user?.grupos?.map(g => ({ id: g.id, nombre: g.nombre, permisos: g.permisos?.slice(0, 3) })),
    }));

    if (!user || (!user.permisos_globales && !user.grupos)) {
      throw new ForbiddenException('No tienes acceso a este recurso');
    }

    const globalPerms = user.permisos_globales || [];
    const groupPerms = user.grupos?.flatMap((g) => g.permisos || []) || [];
    const allPerms = [...new Set([...globalPerms, ...groupPerms])];

    console.log('[DEBUG PermissionsGuard] Permisos globales:', globalPerms);
    console.log('[DEBUG PermissionsGuard] Permisos de grupos:', groupPerms);
    console.log('[DEBUG PermissionsGuard] Todos los permisos:', allPerms);

    const hasPermission = requiredPermissions.some((permission) =>
      allPerms.includes(permission),
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `No tienes el permiso requerido: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }
}
