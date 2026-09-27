import { Global, Module } from '@nestjs/common';
import { ImportService } from './import.service';
import { ReferentialImportController } from './import.controller';

@Global()
@Module({ controllers: [ReferentialImportController], providers: [ImportService], exports: [ImportService] })
export class ImportModule {}
