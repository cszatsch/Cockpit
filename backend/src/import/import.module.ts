import { Global, Module } from '@nestjs/common';
import { ImportService } from './import.service';

/** Moteur d'import Excel (Console). La route d'import du Cockpit est retirée depuis le 18/10/2026 (audit de sécurité). */
@Global()
@Module({ providers: [ImportService], exports: [ImportService] })
export class ImportModule {}
