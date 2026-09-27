import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module';
import { CockpitModule } from './cockpit/cockpit.module';

@Module({
  imports: [CoreModule, CockpitModule],
})
export class AppModule {}
