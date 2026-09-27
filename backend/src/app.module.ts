import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module';
import { CockpitModule } from './cockpit/cockpit.module';
import { ImportModule } from './import/import.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [CoreModule, ImportModule, CockpitModule, AdminModule],
})
export class AppModule {}
