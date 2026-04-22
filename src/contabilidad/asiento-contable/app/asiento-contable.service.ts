import {
  ASIENTO_CONTABLE_REPOSITORY,
  AsientoContableRepository,
} from '../domain/domain.repository';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AsientoContable } from '../entities/asiento-contable.entity';
import { AsientoContableLinea } from '../entities/asiento-contable-linea.entity';
import { ErrorHandler } from 'src/utils/error_handler';
import { CreateAsientoContableDto } from '../dto/dto';
import { OrigenAsientoContable, Prisma } from '@prisma/client';

@Injectable()
export class AsientoContableService {
  private readonly logger = new Logger(AsientoContableService.name);

  constructor(
    @Inject(ASIENTO_CONTABLE_REPOSITORY)
    private readonly repo: AsientoContableRepository,
  ) {}

  // =========================
  // CREAR ASIENTO BASE
  // =========================
  async crearAsiento(dto: CreateAsientoContableDto): Promise<AsientoContable> {
    try {
      const asiento = new AsientoContable(
        0,
        new Date(),
        dto.descripcion,
        dto.origen,
        dto.origenId,
      );

      for (const l of dto.lineas) {
        asiento.agregarLinea(
          new AsientoContableLinea(
            l.cuentaContableId,
            l.debe,
            l.haber,
            l.descripcion,
          ),
        );
      }

      asiento.postear();

      return await this.repo.save(asiento);
    } catch (error) {
      ErrorHandler.handle(error, {
        operacion: 'crear asiento contable',
        origen: dto.origen,
      });
    }
  }

  // =========================
  // REVERSA (ANULACIÓN)
  // =========================
  async reversarAsiento(id: number): Promise<AsientoContable> {
    try {
      const asiento = await this.repo.findById(id);

      if (!asiento) {
        throw new NotFoundException(`Asiento ${id} no encontrado`);
      }

      const reversa = asiento.generarReversa();

      return await this.repo.save(reversa);
    } catch (error) {
      ErrorHandler.handle(error, {
        operacion: 'reversar asiento',
        id,
      });
    }
  }

  // =========================
  // CASO: VENTA
  // =========================
  async registrarVenta(data: {
    ventaId: number;
    total: number;
    costo: number;
    cuentaCaja: number;
    cuentaVentas: number;
    cuentaCosto: number;
    cuentaInventario: number;
  }): Promise<AsientoContable> {
    try {
      const asiento = new AsientoContable(
        0,
        new Date(),
        `Venta #${data.ventaId}`,
        OrigenAsientoContable.VENTA,
        data.ventaId,
      );

      // INGRESO
      asiento.agregarLinea(
        new AsientoContableLinea(data.cuentaCaja, data.total, 0),
      );

      asiento.agregarLinea(
        new AsientoContableLinea(data.cuentaVentas, 0, data.total),
      );

      // COSTO
      asiento.agregarLinea(
        new AsientoContableLinea(data.cuentaCosto, data.costo, 0),
      );

      asiento.agregarLinea(
        new AsientoContableLinea(data.cuentaInventario, 0, data.costo),
      );

      asiento.postear();

      return await this.repo.save(asiento);
    } catch (error) {
      ErrorHandler.handle(error, {
        operacion: 'registrar venta contable',
        ventaId: data.ventaId,
      });
    }
  }

  // =========================
  // CASO: MOVIMIENTO FINANCIERO
  // =========================
  async registrarMovimientoFinanciero(data: {
    movimientoId: number;
    monto: number;
    cuentaOrigen: number;
    cuentaDestino: number;
  }): Promise<AsientoContable> {
    try {
      const asiento = new AsientoContable(
        0,
        new Date(),
        `Movimiento #${data.movimientoId}`,
        OrigenAsientoContable.MOVIMIENTO_FINANCIERO,

        data.movimientoId,
      );

      asiento.agregarLinea(
        new AsientoContableLinea(data.cuentaDestino, data.monto, 0),
      );

      asiento.agregarLinea(
        new AsientoContableLinea(data.cuentaOrigen, 0, data.monto),
      );

      asiento.postear();

      return await this.repo.save(asiento);
    } catch (error) {
      ErrorHandler.handle(error);
    }
  }

  async crearDesdeRegla(
    params: {
      descripcion: string;
      origen: OrigenAsientoContable;
      origenId?: number;
      monto: number;
      cuentaDebeId: number;
      cuentaHaberId: number;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<AsientoContable> {
    try {
      const asiento = new AsientoContable(
        0,
        new Date(),
        params.descripcion,
        params.origen,
        params.origenId,
      );

      asiento.agregarLinea(
        new AsientoContableLinea(
          params.cuentaDebeId,
          params.monto,
          0,
          'Debe automático',
        ),
      );

      asiento.agregarLinea(
        new AsientoContableLinea(
          params.cuentaHaberId,
          0,
          params.monto,
          'Haber automático',
        ),
      );

      asiento.postear();

      return await this.repo.save(asiento, tx);
    } catch (error) {
      ErrorHandler.handle(error, {
        operacion: 'crear asiento desde regla',
      });
    }
  }

  async getAll() {
    return await this.repo.findAll();
  }
}
