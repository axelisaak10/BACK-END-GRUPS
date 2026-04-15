import { Controller, Get, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';

@Controller('auth')
export class AuthController {
  private clients = new Map<string, Response>();

  constructor(private configService: ConfigService) {}

  @Get('events')
  sseEvents(
    @Query('token') queryToken: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const authHeader = req.headers.authorization;
    const token =
      queryToken ||
      (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);

    if (!token) {
      throw new UnauthorizedException('Token requerido');
    }

    const secret = this.configService.get<string>('JWT_SECRET') || 'default-secret';

    try {
      const decoded = jwt.verify(token, secret) as any;
      const userId: string = decoded.sub;

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': req.headers.origin || '*',
        'Access-Control-Allow-Credentials': 'true',
      });

      const clientId = `groups-${userId}-${Date.now()}`;
      this.clients.set(clientId, res);

      console.log(`[SSE-Groups] Client connected: ${clientId}`);
      res.write('event: connected\ndata: {"service":"groups"}\n\n');

      const heartbeat = setInterval(() => {
        if (!res.writableEnded) {
          res.write(': heartbeat\n\n');
        } else {
          clearInterval(heartbeat);
        }
      }, 30000);

      req.on('close', () => {
        clearInterval(heartbeat);
        this.clients.delete(clientId);
        console.log(`[SSE-Groups] Client disconnected: ${clientId}`);
      });
    } catch (err) {
      console.error('[SSE-Groups] Token inválido:', (err as Error).message);
      throw new UnauthorizedException('Token inválido');
    }
  }

  broadcast(event: string, data: unknown) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const [id, res] of this.clients) {
      if (!res.writableEnded) {
        res.write(payload);
      } else {
        this.clients.delete(id);
      }
    }
  }
}
