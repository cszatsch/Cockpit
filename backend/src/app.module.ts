import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module';
import { CockpitModule } from './cockpit/cockpit.module';
import { ImportModule } from './import/import.module';

@Module({
  imports: [CoreModule, ImportModule, CockpitModule],
})
export class AppModule {}
