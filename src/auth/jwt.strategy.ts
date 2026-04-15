import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string;
  permisos_globales: string[];
  grupos: { id: string; nombre: string; permisos: string[] }[];
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: any) => {
          // Intentar leer de cookie primero
          const fromCookie = request?.cookies?.Authentication || null;
          if (fromCookie) {
            return fromCookie;
          }
          // Luego intentar del header Authorization
          const authHeader = request?.headers?.authorization;
          if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
          }
          return null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'default-secret',
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    console.log('[DEBUG JwtStrategy] Payload recibido:', JSON.stringify({
      sub: payload.sub,
      permisos_globales: payload.permisos_globales,
      grupos: payload.grupos?.map(g => ({ id: g.id, nombre: g.nombre, permisos: g.permisos?.slice(0, 3) })),
    }));

    if (!payload.sub) {
      throw new UnauthorizedException('Token inválido');
    }

    return {
      sub: payload.sub,
      permisos_globales: payload.permisos_globales || [],
      grupos: payload.grupos || [],
    };
  }
}
