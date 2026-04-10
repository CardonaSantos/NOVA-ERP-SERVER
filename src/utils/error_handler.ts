// error.handler.ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  HttpException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod'; // opcional: si usas zod, instala/importe; si no, la guard comprueba por nombre

type Context = Record<string, any> | undefined;

export class ErrorHandler {
  private static readonly logger = new Logger('ErrorHandler');

  /**
   * Maneja cualquier error conocido y lanza la HttpException apropiada.
   * - Siempre lanza (never)
   * - Param `error` typed as unknown para forzar guards seguros
   */
  static handle(error: unknown, context?: Context): never {
    // Log minimal + stack when exista
    const message = ErrorHandler.safeMessage(error);
    ErrorHandler.logger.error(message, ErrorHandler.safeStack(error));

    // 1) Si ya es HttpException (Nest) -> re-lanzar tal cual
    if (ErrorHandler.isHttpException(error)) {
      throw error;
    }

    // 2) Prisma errors
    if (ErrorHandler.isPrismaKnownRequestError(error)) {
      ErrorHandler.handlePrisma(error, context);
    }

    // 3) Postgres / SQL generic (psql codes)
    if (ErrorHandler.isSqlError(error)) {
      ErrorHandler.handleSql(error, context);
    }

    // 4) Mongo / Mongoose duplicate key
    if (ErrorHandler.isMongoDuplicateKeyError(error)) {
      const key = ErrorHandler.mongoDuplicateKeyTarget(error);
      throw new ConflictException(
        `Conflicto de duplicidad${key ? ` en ${key}` : ''}.`,
      );
    }

    // 5) Axios errors (cliente http)
    if (ErrorHandler.isAxiosError(error)) {
      ErrorHandler.handleAxios(error);
    }

    // 6) Zod validation
    if (ErrorHandler.isZodError(error)) {
      const details = error.issues.map(
        (e) => `${e.path.join('.')}: ${e.message}`,
      );

      throw new BadRequestException({
        message: 'Validación inválida (zod).',
        details,
      });
    }
    // 7) class-validator / ValidationPipe arrays or ValidationError[]
    if (ErrorHandler.isClassValidatorErrors(error)) {
      const details = ErrorHandler.flattenClassValidator(error);
      throw new BadRequestException({
        message: 'Validación inválida.',
        details,
      });
    }

    // 8) Multer (upload) errors
    if (ErrorHandler.isMulterError(error)) {
      throw new BadRequestException(
        `Error de subida: ${(error as any).message || (error as any).code}`,
      );
    }

    // 9) Common JS/TS Error -> BadRequest (o fallback)
    if (error instanceof Error) {
      // Decide mapping según nombres/códigos si aplica
      const name = error.name?.toLowerCase();
      if (name.includes('unauthorized') || name.includes('authentication')) {
        throw new UnauthorizedException(error.message);
      }
      if (name.includes('forbidden')) {
        throw new ForbiddenException(error.message);
      }
      if (name.includes('notfound') || name.includes('not found')) {
        throw new NotFoundException(error.message);
      }
      // default para Error
      throw new BadRequestException(error.message);
    }

    // 10) Fallback absoluto
    throw new InternalServerErrorException('Error interno no controlado.');
  }

  /* ---------------------- Helpers / Handlers ---------------------- */

  private static handlePrisma(
    error: Prisma.PrismaClientKnownRequestError,
    context?: Context,
  ): never {
    switch (error.code) {
      case 'P2002': {
        const target = (error.meta?.target as string[]) || [];
        throw new ConflictException(
          `Conflicto de duplicidad: ${target.length ? `[${target.join(', ')}]` : 'valor duplicado'}.`,
        );
      }
      case 'P2003': {
        throw new NotFoundException('Relación/clave foránea no encontrada.');
      }
      case 'P2025': {
        // e.g., "An operation failed because it depends on one or more records that were required but not found."
        throw new NotFoundException(
          error.meta?.cause || 'Registro no encontrado.',
        );
      }
      case 'P2000': // value too long for column
      case 'P2001':
        throw new BadRequestException(error.message);
      default:
        throw new InternalServerErrorException(
          `Error de base de datos (Prisma): ${error.code}`,
        );
    }
  }

  private static handleSql(error: any, context?: Context): never {
    const code = error.code as string | undefined;
    switch (code) {
      case '23505': // unique_violation
        throw new ConflictException(
          'Conflicto de duplicidad (unique constraint).',
        );
      case '23503': // foreign_key_violation
        throw new NotFoundException('Relación no encontrada (foreign key).');
      case '23502': // not_null_violation
        throw new BadRequestException('Falta valor requerido (not null).');
      default:
        throw new InternalServerErrorException(
          `Error de base de datos (SQL): ${code ?? 'desconocido'}`,
        );
    }
  }

  private static handleAxios(error: any): never {
    const status = error.response?.status;
    const data = error.response?.data;
    if (status >= 500) {
      throw new ServiceUnavailableException(
        `Servicio externo no disponible (status ${status}).`,
      );
    }
    if (status === 404) {
      throw new NotFoundException(
        data?.message || 'Recurso no encontrado en servicio externo.',
      );
    }
    if (status === 401) {
      throw new UnauthorizedException(
        data?.message || 'No autorizado por servicio externo.',
      );
    }
    // 400-ish
    throw new BadRequestException({
      message: data?.message ?? 'Error en petición a servicio externo.',
      detail: data,
    });
  }

  /* ---------------------- Type Guards ---------------------- */

  private static isHttpException(x: unknown): x is HttpException {
    return x instanceof HttpException;
  }

  private static isPrismaKnownRequestError(
    x: unknown,
  ): x is Prisma.PrismaClientKnownRequestError {
    return (
      typeof x === 'object' &&
      x !== null &&
      (x as any).name === 'PrismaClientKnownRequestError' &&
      typeof (x as any).code === 'string'
    );
  }

  private static isSqlError(x: unknown): boolean {
    return (
      typeof x === 'object' &&
      x !== null &&
      typeof (x as any).code === 'string' &&
      /^[0-9A-Z]+$/.test((x as any).code)
    );
  }

  private static isMongoDuplicateKeyError(x: unknown): boolean {
    return (
      typeof x === 'object' &&
      x !== null &&
      ((x as any).code === 11000 || (x as any).name === 'MongoServerError')
    );
  }

  private static mongoDuplicateKeyTarget(x: any): string | null {
    try {
      const key = Object.keys(x.keyValue || {})[0];
      return key ?? null;
    } catch {
      return null;
    }
  }

  private static isAxiosError(x: unknown): boolean {
    return (
      typeof x === 'object' && x !== null && (x as any).isAxiosError === true
    );
  }

  private static isZodError(x: unknown): x is ZodError {
    return (
      typeof x === 'object' &&
      x !== null &&
      (x as any).name === 'ZodError' &&
      Array.isArray((x as any).errors)
    );
  }

  private static isClassValidatorErrors(x: unknown): boolean {
    // class-validator ValidationError[] or Nest ValidationPipe payload (object with 'message' array)
    if (
      Array.isArray(x) &&
      x.length &&
      typeof (x[0] as any).constraints === 'object'
    )
      return true;
    if (
      typeof x === 'object' &&
      x !== null &&
      Array.isArray((x as any).message)
    ) {
      return (x as any).message.every(
        (m: any) => typeof m === 'string' || Array.isArray(m),
      );
    }
    return false;
  }

  private static isMulterError(x: unknown): boolean {
    return (
      typeof x === 'object' && x !== null && (x as any).name === 'MulterError'
    );
  }

  /* ---------------------- Misc utils ---------------------- */

  private static flattenClassValidator(x: any): string[] {
    // x might be ValidationError[] or Nest BadRequestException payload
    if (Array.isArray(x)) {
      const out: string[] = [];
      for (const ve of x) {
        if (ve.constraints) {
          out.push(
            ...Object.values(ve.constraints).map((v: unknown) => String(v)),
          );
        } else if (ve.children && ve.children.length) {
          out.push(...ErrorHandler.flattenClassValidator(ve.children));
        }
      }
      return out;
    }
    if (typeof x === 'object' && x !== null && Array.isArray(x.message)) {
      return x.message.flatMap((m: any) =>
        Array.isArray(m) ? m : [String(m)],
      );
    }
    return [String(x)];
  }

  private static safeMessage(err: unknown): string {
    if (!err) return 'unknown error';
    if (err instanceof Error) return err.message;
    if (typeof err === 'object' && (err as any).message)
      return String((err as any).message);
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }

  private static safeStack(err: unknown): string | undefined {
    if (err instanceof Error) return err.stack;
    return undefined;
  }
}
