import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { z } from 'zod';
import { PrismaService } from '../prisma.service';
import { Actor, CurrentActor, Public } from './auth';
import { config } from '../config';
import { notFound, unauthorized } from '../errors';
import { parse } from '../http';

const DevLogin = z
  .object({
    personId: z.string().optional(),
    accountId: z.string().optional(),
    email: z.string().optional(),
  })
  .refine((v) => v.personId || v.accountId || v.email, { message: 'personId, accountId ou email requis' });

/**
 * Authentification. Le fournisseur d'identité réel est hors périmètre (brief § 4) :
 * `dev-login` délivre un jeton pour un compte existant, uniquement si `AUTH_DEV=true`.
 */
@ApiTags('auth')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  @Public()
  @Post('dev-login')
  @HttpCode(200)
  async devLogin(@Body() body: unknown, @Req() req: any) {
    if (!config.authDev) throw notFound();
    const input = parse(DevLogin, body);
    const account = input.accountId
      ? await this.prisma.account.findUnique({ where: { id: input.accountId } })
      : input.personId
        ? await this.prisma.account.findFirst({ where: { personId: input.personId } })
        : await this.prisma.account.findUnique({ where: { email: input.email!.toLowerCase() } });
    if (!account) throw unauthorized('Compte inconnu');
    if (account.status !== 'ACTIVE') throw unauthorized('Compte inactif ou suspendu');
    const session = await this.prisma.authSession.create({
      data: {
        accountId: account.id,
        device: String(req.headers['user-agent'] ?? 'inconnu').slice(0, 120),
        location: req.ip ?? null,
      },
    });
    await this.prisma.account.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } });
    const token = await this.jwt.signAsync({ sub: account.id, sid: session.id });
    return { token, accountId: account.id, personId: account.personId, sessionId: session.id };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentActor() actor: Actor) {
    await this.prisma.authSession.update({ where: { id: actor.sessionId }, data: { revokedAt: new Date() } });
  }
}
