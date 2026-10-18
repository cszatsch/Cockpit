/** Fichier reçu par multer (mémoire). */
export interface UploadedBlob {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
