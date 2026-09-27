import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

/** Usage d'un objet qui empêche sa suppression (brief § 7.7). */
export interface Usage {
  entityType: string;
  id: string;
  label: string;
}

/** Corps d'erreur unique de l'API (brief Cockpit § 9.1). */
export interface ErrorBody {
  code: string;
  message: string;
  fields?: Record<string, string>;
  usages?: Usage[];
}

export class ApiError extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
    readonly usages?: Usage[],
  ) {
    super({ code, message, fields, usages } satisfies ErrorBody, status);
  }
}

/** Erreur portant un corps enrichi (ex. rapport d'import refusé). */
export class ApiErrorWithBody extends HttpException {
  constructor(status: number, body: ErrorBody & Record<string, unknown>) {
    super(body, status);
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) =>
  new ApiError(400, 'VALIDATION_ERROR', message, fields);
export const unauthorized = (message = 'Authentification requise') =>
  new ApiError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'Action non autorisée pour votre profil') =>
  new ApiError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Ressource introuvable') => new ApiError(404, 'NOT_FOUND', message);
export const conflict = (code: string, message: string, usages?: Usage[]) =>
  new ApiError(409, code, message, undefined, usages);
export const inUse = (usages: Usage[]) =>
  new ApiError(409, 'IN_USE', 'Suppression impossible : objet utilisé ailleurs', undefined, usages);
export const preconditionFailed = () =>
  new ApiError(412, 'VERSION_MISMATCH', "L'objet a été modifié entre-temps ; rechargez-le");
export const businessRule = (message: string, fields?: Record<string, string>) =>
  new ApiError(422, 'BUSINESS_RULE', message, fields);

/** Convertit une ZodError en dictionnaire champ → message. */
export function zodFields(err: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

/** Filtre global : toute erreur sort au format { code, message, fields?, usages? }. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    const [status, body] = toErrorBody(exception);
    if (status >= 500 && !(exception instanceof ApiError)) console.error(exception);
    res.status(status).json(body);
  }
}

export function toErrorBody(exception: unknown): [number, ErrorBody] {
  if (exception instanceof ApiError || exception instanceof ApiErrorWithBody) {
    return [exception.getStatus(), exception.getResponse() as ErrorBody];
  }
  if (exception instanceof ZodError) {
    return [400, { code: 'VALIDATION_ERROR', message: 'Données invalides', fields: zodFields(exception) }];
  }
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    if (exception.code === 'P2002') {
      const target = (exception.meta?.target as string[] | undefined)?.join(', ');
      return [409, { code: 'DUPLICATE', message: `Valeur déjà utilisée${target ? ` (${target})` : ''}` }];
    }
    if (exception.code === 'P2025') return [404, { code: 'NOT_FOUND', message: 'Ressource introuvable' }];
    if (exception.code === 'P2003') {
      return [409, { code: 'IN_USE', message: 'Référence invalide ou objet utilisé ailleurs' }];
    }
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const r = exception.getResponse();
    const message = typeof r === 'string' ? r : ((r as any).message ?? exception.message);
    const code =
      status === 404 ? 'NOT_FOUND' : status === 413 ? 'PAYLOAD_TOO_LARGE' : status === 400 ? 'VALIDATION_ERROR' : 'HTTP_ERROR';
    return [status, { code, message: Array.isArray(message) ? message.join(' ; ') : String(message) }];
  }
  return [HttpStatus.INTERNAL_SERVER_ERROR, { code: 'INTERNAL_ERROR', message: 'Erreur interne' }];
}
