import { Module } from '@nestjs/common';
import { MeController } from './me.controller';

/** API du Cockpit : `/api/me`, `/api/projects/{projectId}/…`. */
@Module({
  controllers: [MeController],
})
export class CockpitModule {}
