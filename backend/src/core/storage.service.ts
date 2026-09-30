import { Injectable } from '@nestjs/common';
import fs from 'fs/promises';
import path from 'path';
import { randomBytes } from 'crypto';
import { config } from './config';

/**
 * Stockage objet (brief § 6.2 `fileKey`) : implémentation sur disque local, derrière une interface
 * remplaçable (S3, Azure Blob…). Les clés sont opaques et ne contiennent jamais de chemin fourni par l'utilisateur.
 */
@Injectable()
export class StorageService {
  private root() {
    return path.resolve(config.storageDir);
  }

  private resolve(key: string) {
    if (!/^[a-z0-9/_.-]+$/i.test(key) || key.includes('..')) throw new Error('Clé de stockage invalide');
    return path.join(this.root(), key);
  }

  async put(prefix: string, data: Buffer, ext = ''): Promise<string> {
    const safeExt = ext.replace(/[^a-z0-9.]/gi, '').slice(0, 10);
    const key = `${prefix}/${new Date().toISOString().slice(0, 10)}/${randomBytes(12).toString('hex')}${safeExt}`;
    const file = this.resolve(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
    return key;
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.resolve(key));
    } catch {
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    // Windows : un fichier juste écrit peut être verrouillé un instant (antivirus) ; nouvelles tentatives.
    await fs.rm(this.resolve(key), { force: true, maxRetries: 5, retryDelay: 100 });
  }
}
