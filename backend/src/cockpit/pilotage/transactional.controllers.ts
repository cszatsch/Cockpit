import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Query, Type } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessService } from '../../core/access.service';
import { Actor, CurrentActor } from '../../core/auth/auth';
import { TransactionalService, TX_ENTITIES, TxEntity } from './transactional';

/** GET | POST | PATCH | DELETE pour risques, problèmes, actions et décisions (brief § 9.5). */
function makeController(def: TxEntity): Type<unknown> {
  @ApiTags(`cockpit · pilotage · ${def.route}`)
  @ApiBearerAuth()
  @Controller(`api/projects/:projectId/${def.route}`)
  class TxController {
    constructor(readonly svc: TransactionalService, readonly access: AccessService) {}

    @Get()
    async list(@CurrentActor() a: Actor, @Param('projectId') p: string, @Query() q: Record<string, string>) {
      return this.svc.list(def, await this.access.scope(a, p), q);
    }

    @Get(':id')
    async get(@CurrentActor() a: Actor, @Param('projectId') p: string, @Param('id') id: string) {
      return this.svc.get(def, await this.access.scope(a, p), id);
    }

    @Post()
    async create(@CurrentActor() a: Actor, @Param('projectId') p: string, @Body() body: unknown) {
      return this.svc.create(def, a, await this.access.scope(a, p), body);
    }

    @Patch(':id')
    async patch(@CurrentActor() a: Actor, @Param('projectId') p: string, @Param('id') id: string, @Body() body: unknown, @Headers('if-match') ifMatch?: string) {
      return this.svc.patch(def, a, await this.access.scope(a, p), id, body, ifMatch);
    }

    @Delete(':id')
    @HttpCode(204)
    async remove(@CurrentActor() a: Actor, @Param('projectId') p: string, @Param('id') id: string, @Headers('if-match') ifMatch?: string) {
      await this.svc.remove(def, a, await this.access.scope(a, p), id, ifMatch);
    }
  }
  Object.defineProperty(TxController, 'name', { value: `Tx${def.route[0].toUpperCase()}${def.route.slice(1)}Controller` });
  return TxController;
}

export const TX_CONTROLLERS = TX_ENTITIES.map(makeController);
