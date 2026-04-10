import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { CreateWarrantyDto } from './dto/create-warranty.dto';
import { UpdateWarrantyDto } from './dto/update-warranty.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { RegistroGarantiaDto } from './dto/create-regist-warranty.dto';

import { HistorialStockTrackerService } from 'src/historial-stock-tracker/historial-stock-tracker.service';
import {
  EstadoDetalleVenta,
  EstadoGarantia,
  Prisma,
  TipoMovimientoStock,
} from '@prisma/client';
import { GarantiaDto } from './interfaces';
import { createNewTimeLimeDTO } from './dto-timeline/timelineCreateDTO.dto';
import { dayjs } from 'src/utils/dayjs';

const estadosQueCierran = [
  EstadoGarantia.REPARADO,
  EstadoGarantia.REEMPLAZADO,
  EstadoGarantia.RECHAZADO_CLIENTE,
  EstadoGarantia.CANCELADO,
];

@Injectable()
export class WarrantyService {
  private readonly logger = new Logger(WarrantyService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly tracker: HistorialStockTrackerService,
  ) {}
  //CREAR REGISTRO INICIAL, TRACKEAR MOVIMIENTO, RECUPERAR STOCK
  async create(createWarrantyDto: CreateWarrantyDto) {
    const {
      ventaId,
      productoId,
      sucursalId,
      usuarioIdRecibe,
      clienteId,
      cantidadDevuelta,
      descripcionProblema,
      comentario,
    } = createWarrantyDto;

    if (!clienteId) {
      throw new BadRequestException(
        'Una garantía no se puede registrar a una venta con CF',
      );
    }

    if (!clienteId || !productoId || !ventaId || !usuarioIdRecibe) {
      throw new BadRequestException(
        'Faltan datos necesarios para crear la garantía',
      );
    }
    if (!sucursalId) {
      throw new BadRequestException('Sucursal requerida para la garantía');
    }
    if (!cantidadDevuelta || cantidadDevuelta <= 0) {
      throw new BadRequestException('Cantidad devuelta inválida');
    }

    const nowGT = dayjs().tz('America/Guatemala').toDate();

    try {
      const garantiaConRegistros = await this.prisma.$transaction(
        async (tx) => {
          // 1) Validar que exista el item de venta y que la cantidad sea coherente con devoluciones abiertas
          const ventaProd = await tx.ventaProducto.findFirst({
            where: { ventaId, productoId },
            select: { id: true, cantidad: true, precioVenta: true },
          });
          if (!ventaProd) {
            throw new BadRequestException(
              `No existe item venta ${ventaId}/${productoId}`,
            );
          }

          // Cantidad ya devuelta en garantías NO CERRADAS
          const agg = await tx.garantia.aggregate({
            _sum: { cantidadDevuelta: true },
            where: {
              ventaId,
              productoId,
              estado: { not: EstadoGarantia.CERRADO },
            },
          });
          const yaDevuelto = Number(agg._sum.cantidadDevuelta ?? 0);
          const maxDevolvible = ventaProd.cantidad - yaDevuelto;
          if (cantidadDevuelta > maxDevolvible) {
            throw new BadRequestException(
              `Cantidad devuelta (${cantidadDevuelta}) excede el máximo (${maxDevolvible}).`,
            );
          }

          // 2) Crear garantía (RECIBIDO)
          const garantia = await tx.garantia.create({
            data: {
              venta: { connect: { id: ventaId } },
              producto: { connect: { id: productoId } },
              cliente: { connect: { id: clienteId } },
              sucursal: { connect: { id: sucursalId } },
              usuarioRecibe: { connect: { id: usuarioIdRecibe } },
              cantidadDevuelta,
              descripcionProblema,
              comentario,
              estado: EstadoGarantia.RECIBIDO,
              fechaRecepcion: nowGT,
            },
          });

          // 3) Registro de timeline inicial
          await tx.registroGarantia.create({
            data: {
              garantia: { connect: { id: garantia.id } },
              usuario: { connect: { id: usuarioIdRecibe } },
              estado: EstadoGarantia.RECIBIDO,
              accionesRealizadas: 'Recepción de garantía',
              fechaRegistro: nowGT,
            },
          });

          // (Opcional) Si quieres marcar el detalle como "PARCIAL_GARANTIA" sin tocar su cantidad:
          // await tx.ventaProducto.update({ where: { id: ventaProd.id }, data: { estado: 'PARCIAL_GARANTIA' } });

          return tx.garantia.findUnique({
            where: { id: garantia.id },
            include: { registros: true },
          });
        },
      );

      return garantiaConRegistros!;
    } catch (error) {
      this.logger.error('El error es: ', error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Fatal error: Error inesperado en registrar garantía',
      );
    }
  }

  async createNewTimeLime(dto: createNewTimeLimeDTO) {
    try {
      const { conclusion, accionesRealizadas, estado, garantiaID, userID } =
        dto;
      if (
        [conclusion, accionesRealizadas, estado, garantiaID, userID].some(
          (p) => p == null,
        )
      ) {
        throw new BadRequestException('PROP INDEFINIDA');
      }

      return await this.prisma.$transaction(async (tx) => {
        // 1) Nuevo registro de timeline
        const newTimeLine = await tx.registroGarantia.create({
          data: {
            garantia: { connect: { id: garantiaID } },
            usuario: { connect: { id: userID } },
            estado,
            accionesRealizadas,
            conclusion,
            fechaRegistro: dayjs().tz('America/Guatemala').toDate(),
          },
        });

        // 2) Actualizar estado principal
        const garantiaMain = await tx.garantia.update({
          where: { id: garantiaID },
          data: { estado },
          include: {
            venta: { select: { id: true, sucursalId: true } },
            producto: { select: { id: true } },
          },
        });

        // 3) Si se va a CERRAR, aplicar efectos según el estado PREVIO
        if (estado === EstadoGarantia.CERRADO) {
          // Tomar el estado previo (penúltimo registro)
          const regs = await tx.registroGarantia.findMany({
            where: { garantiaId: garantiaID },
            orderBy: { fechaRegistro: 'asc' },
            select: { estado: true },
          });
          const previo = regs[regs.length - 2]?.estado as
            | EstadoGarantia
            | undefined;

          const validos: EstadoGarantia[] = [
            EstadoGarantia.REPARADO,
            EstadoGarantia.REEMPLAZADO,
            EstadoGarantia.RECHAZADO_CLIENTE,
            EstadoGarantia.CANCELADO,
          ];
          if (!previo || !validos.includes(previo)) {
            throw new BadRequestException(
              `Sólo se puede cerrar desde: ${validos.join(', ')}`,
            );
          }

          // Cargar item de venta y precio unitario
          const ventaProd = await tx.ventaProducto.findFirst({
            where: {
              ventaId: garantiaMain.ventaId,
              productoId: garantiaMain.productoId,
            },
          });
          if (!ventaProd) {
            throw new BadRequestException(
              'No se encontró el ítem de venta a ajustar',
            );
          }

          // Acciones por estado previo
          switch (previo) {
            case EstadoGarantia.REPARADO: {
              // Sin impacto financiero. Si mantuviste un “ingreso virtual” de stock en crear(),
              // aquí harías la salida para devolver al cliente (mantener inventario balanceado).
              // Ejemplo de salida (opcional):
              // await salidaDesdeGarantia(tx, garantiaMain, userID);
              await tx.ventaProducto.update({
                where: { id: ventaProd.id },
                data: { estado: 'GARANTIA_REPARADO' },
              });
              break;
            }

            case EstadoGarantia.REEMPLAZADO: {
              // Entregas una unidad nueva al cliente => salida de inventario normal
              const lote = await tx.stock.findFirst({
                where: {
                  productoId: garantiaMain.productoId,
                  sucursalId: garantiaMain.sucursalId,
                },
                orderBy: { fechaIngreso: 'desc' },
              });
              if (!lote || lote.cantidad < garantiaMain.cantidadDevuelta) {
                throw new BadRequestException(
                  'Stock insuficiente para reemplazo',
                );
              }

              await tx.stock.update({
                where: { id: lote.id },
                data: {
                  cantidad: { decrement: garantiaMain.cantidadDevuelta },
                },
              });

              // Tracker: salida por reemplazo
              await this.tracker.trackerGarantia(
                tx,
                garantiaMain.productoId,
                garantiaMain.sucursalId!,
                userID,
                garantiaID,
                TipoMovimientoStock.GARANTIA,
                'Entrega de reemplazo por garantía',
                lote.cantidad,
                -garantiaMain.cantidadDevuelta,
              );

              await tx.ventaProducto.update({
                where: { id: ventaProd.id },
                data: { estado: 'REEMPLAZADO' },
              });
              // Venta NO cambia (se mantiene el ingreso original).
              break;
            }

            case EstadoGarantia.CANCELADO: {
              // Reembolso: CONTRAVENTA / DEVOLUCION
              // 1) Ajuste por DELTA al total de la venta
              const deltaMonto =
                Number(ventaProd.precioVenta) * garantiaMain.cantidadDevuelta;

              await tx.venta.update({
                where: { id: garantiaMain.ventaId },
                data: { totalVenta: { decrement: deltaMonto } },
              });

              await tx.ventaProducto.update({
                where: { id: ventaProd.id },
                data: { estado: 'REEMBOLSADO' as any }, // tu enum: REEMBOLSADO/REEMBOLSADO
              });

              // 2) Movimiento financiero (flujo de salida al cliente)
              // Si decides devolver por EFECTIVO, usa deltaCaja; si es transferencia, usa deltaBanco + cuentaBancariaId.
              await tx.movimientoFinanciero.create({
                data: {
                  fecha: dayjs().tz('America/Guatemala').toDate(),
                  sucursal: { connect: { id: garantiaMain.sucursalId! } },
                  clasificacion: 'CONTRAVENTA',
                  motivo: 'DEVOLUCION',
                  deltaCaja: new Prisma.Decimal(-deltaMonto), // efectivo (ajústalo según tu método real)
                  deltaBanco: new Prisma.Decimal(0),
                  descripcion: `Devolución garantía #${garantiaID}`,
                  referencia: `GAR-${garantiaID}`,
                  usuario: { connect: { id: userID } },
                  // cuentaBancaria: { connect: { id: cuentaX } } // si reembolsas por banco
                },
              });

              // 3) Inventario: si decides regresar ese producto al stock vendible:
              // const lote = await tx.stock.findFirst({ ... });
              // await tx.stock.update({ ... increment: garantiaMain.cantidadDevuelta });
              break;
            }

            case EstadoGarantia.RECHAZADO_CLIENTE: {
              // No se realizan cambios
              break;
            }
          }
        }

        return newTimeLine;
      });
    } catch (error) {
      this.logger.error('Error timeline garantía: ', error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException({
        message: 'Fatal Error: Error inesperado creando registro timeline',
      });
    }
  }

  //CREAR REGISTRO FINAL DE GARANTÍA
  async createRegistWarranty(creatreRegistWarranty: RegistroGarantiaDto) {}

  async getAllRegistWarranty() {
    try {
      const registrosGarantias = await this.prisma.garantia.findMany({
        include: {
          cliente: true,
          producto: true,
          // proveedor: true,
          // registros: true,
          // usuarioRecibe: true,
          // venta: true,
          movimientoStock: true,
        },
      });
      console.log('Los registros son: ', registrosGarantias.length);
      return registrosGarantias;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      this.logger.error('El error registrado: ', error);
      throw new InternalServerErrorException({
        message: 'Fatal Error: Error inesperado',
      });
    }
  }

  async findAll() {
    try {
      const warranties = await this.prisma.garantia.findMany({
        where: {
          estado: {
            notIn: ['CERRADO'],
          },
        },
        include: {
          cliente: {
            select: {
              id: true,
              nombre: true,
              telefono: true,
              direccion: true,
              dpi: true,
            },
          },
          proveedor: {
            select: {
              id: true,
              nombre: true,
              telefono: true,
              telefonoContacto: true,
            },
          },
          usuarioRecibe: {
            select: {
              id: true,
              nombre: true,
              rol: true,
              sucursal: {
                select: {
                  id: true,
                  nombre: true,
                },
              },
            },
          },
          producto: {
            select: {
              id: true,
              nombre: true,
              descripcion: true,
              codigoProducto: true,
            },
          },
        },
        orderBy: {
          creadoEn: 'desc',
        },
      });

      return warranties;
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Error al conseguir farantías');
    }
  }

  async findOne(id: number) {
    try {
      const warranties = await this.prisma.garantia.findMany({
        where: {
          id,
        },
        include: {
          cliente: {
            select: {
              id: true,
              nombre: true,
              telefono: true,
              direccion: true,
              dpi: true,
            },
          },
          usuarioRecibe: {
            select: {
              id: true,
              nombre: true,
              rol: true,
              sucursal: {
                select: {
                  id: true,
                  nombre: true,
                  direccion: true,
                },
              },
            },
          },
          producto: {
            select: {
              id: true,
              nombre: true,
              descripcion: true,
              codigoProducto: true,
            },
          },
        },
        orderBy: {
          creadoEn: 'desc',
        },
      });

      return warranties;
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Error al conseguir farantías');
    }
  }

  async update(id: number, updateWarrantyDto: UpdateWarrantyDto) {
    try {
      console.log('Los datos llegando al update warranty');
      console.log('La data es: ', updateWarrantyDto);

      if (!id) {
        throw new BadRequestException({
          message: 'ID no proporcionado',
        });
      }

      const { comentario, estado, descripcionProblema } = updateWarrantyDto;

      const registToUpdate = await this.prisma.garantia.update({
        where: {
          id,
        },
        data: {
          comentario: comentario,
          descripcionProblema: descripcionProblema,
          estado: estado,
        },
      });

      console.log(registToUpdate);

      return registToUpdate;
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Error al actualizar');
    }
  }

  async getOneWarrantyFinalForPdf(id: number) {
    // try {
    //   const registsWarranties = await this.prisma.registroGarantia.findUnique({
    //     where: {
    //       id,
    //     },
    //     include: {
    //       producto: {
    //         select: {
    //           id: true,
    //           nombre: true,
    //           descripcion: true,
    //           codigoProducto: true,
    //         },
    //       },
    //       usuario: {
    //         select: {
    //           id: true,
    //           nombre: true,
    //           sucursal: {
    //             select: {
    //               id: true,
    //               nombre: true,
    //               direccion: true,
    //             },
    //           },
    //         },
    //       },
    //       garantia: {
    //         //INFORMACION DE CUANDO SE RECIBIÓ LA GARANTÍA
    //         select: {
    //           id: true,
    //           fechaRecepcion: true,
    //           estado: true,
    //           cliente: {
    //             select: {
    //               id: true,
    //               nombre: true,
    //               telefono: true,
    //               direccion: true,
    //               dpi: true,
    //             },
    //           },
    //         },
    //       },
    //     },
    //   });
    //   return registsWarranties;
    // } catch (error) {
    //   console.error('Error al obtener registros de garantía:', error);
    //   throw new Error('Error al obtener registros de garantía.');
    // }
  }

  async remove(id: number) {
    try {
      if (!id) throw new BadRequestException('ID proporcionado no válido');

      const garantiaToDelete = await this.prisma.garantia.delete({
        where: {
          id,
        },
      });

      return garantiaToDelete;
    } catch (error) {
      this.logger.error('El error en eliminar garantia es: ', error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Fatal error: Error inesperado en eliminar garantía',
      );
    }
  }

  async removeAll() {
    try {
      const warranties = await this.prisma.garantia.deleteMany({});
      return warranties;
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Error al eliminar las garantías');
    }
  }

  /**
   *
   * @returns array de garantias no cerradas
   */
  async getGarantiasNotClosed(): Promise<GarantiaDto[]> {
    const raw = await this.prisma.garantia.findMany({
      where: {
        estado: {
          not: 'CERRADO',
        },
      },
      include: {
        venta: { select: { id: true, fechaVenta: true } },
        cliente: { select: { id: true, nombre: true } },
        producto: {
          select: {
            id: true,
            nombre: true,
            codigoProducto: true,
            descripcion: true,
          },
        },
        proveedor: { select: { id: true, nombre: true } },
        usuarioRecibe: { select: { id: true, nombre: true } },
        registros: {
          include: { usuario: { select: { id: true, nombre: true } } },
          orderBy: { fechaRegistro: 'asc' },
        },
        movimientoStock: {
          include: { usuario: { select: { id: true, nombre: true } } },
          orderBy: { fechaCambio: 'asc' },
        },
      },
    });

    return raw.map((g) => ({
      comentario: g.comentario,
      descripcionProblema: g.descripcionProblema,
      actualizadoEn: g.actualizadoEn,
      id: g.id,
      ventaId: g.ventaId,
      venta: {
        id: g.venta.id,
        fechaVenta: g.venta.fechaVenta.toISOString(),
      },
      fechaRecepcion: g.fechaRecepcion.toISOString(),
      estado: g.estado,
      cantidadDevuelta: g.cantidadDevuelta,
      cliente: { id: g.cliente.id, nombre: g.cliente.nombre },
      producto: {
        id: g.producto.id,
        nombre: g.producto.nombre,
        codigo: g.producto.codigoProducto,
        descripcion: g.producto.descripcion,
      },
      proveedor: g.proveedor
        ? { id: g.proveedor.id, nombre: g.proveedor.nombre }
        : undefined,
      usuarioRecibe: g.usuarioRecibe
        ? { id: g.usuarioRecibe.id, nombre: g.usuarioRecibe.nombre }
        : undefined,
      registros: g.registros.map((r) => ({
        id: r.id,
        estado: r.estado,
        fechaRegistro: r.fechaRegistro.toISOString(),
        accionesRealizadas: r.accionesRealizadas,
        conclusion: r.conclusion,

        usuario: r.usuario
          ? { id: r.usuario.id, nombre: r.usuario.nombre }
          : undefined,
      })),
      movimientoStock: g.movimientoStock.map((m) => ({
        id: m.id,
        cantidadAnterior: m.cantidadAnterior,
        cantidadNueva: m.cantidadNueva,
        fechaCambio: m.fechaCambio.toISOString(),
        usuario: { id: m.usuario.id, nombre: m.usuario.nombre },
      })),
    }));
  }

  /**
   *
   * @returns array de garantias para mapeo de historial
   */
  async getAllGarantias(): Promise<GarantiaDto[]> {
    const raw = await this.prisma.garantia.findMany({
      include: {
        venta: { select: { id: true, fechaVenta: true } },
        cliente: { select: { id: true, nombre: true } },
        producto: {
          select: {
            id: true,
            nombre: true,
            codigoProducto: true,
            descripcion: true,
          },
        },
        proveedor: { select: { id: true, nombre: true } },
        usuarioRecibe: { select: { id: true, nombre: true } },
        registros: {
          include: { usuario: { select: { id: true, nombre: true } } },
          orderBy: { fechaRegistro: 'asc' },
        },
        movimientoStock: {
          include: { usuario: { select: { id: true, nombre: true } } },
          orderBy: { fechaCambio: 'asc' },
        },
      },
    });

    return raw.map((g) => ({
      comentario: g.comentario,
      descripcionProblema: g.descripcionProblema,
      actualizadoEn: g.actualizadoEn,
      id: g.id,
      ventaId: g.ventaId,
      venta: {
        id: g.venta.id,
        fechaVenta: g.venta.fechaVenta.toISOString(),
      },
      fechaRecepcion: g.fechaRecepcion.toISOString(),
      estado: g.estado,
      cantidadDevuelta: g.cantidadDevuelta,
      cliente: { id: g.cliente.id, nombre: g.cliente.nombre },
      producto: {
        id: g.producto.id,
        nombre: g.producto.nombre,
        codigo: g.producto.codigoProducto,
        descripcion: g.producto.descripcion,
      },
      proveedor: g.proveedor
        ? { id: g.proveedor.id, nombre: g.proveedor.nombre }
        : undefined,
      usuarioRecibe: g.usuarioRecibe
        ? { id: g.usuarioRecibe.id, nombre: g.usuarioRecibe.nombre }
        : undefined,
      registros: g.registros.map((r) => ({
        id: r.id,
        estado: r.estado,
        fechaRegistro: r.fechaRegistro.toISOString(),
        accionesRealizadas: r.accionesRealizadas,
        conclusion: r.conclusion,

        usuario: r.usuario
          ? { id: r.usuario.id, nombre: r.usuario.nombre }
          : undefined,
      })),
      movimientoStock: g.movimientoStock.map((m) => ({
        id: m.id,
        cantidadAnterior: m.cantidadAnterior,
        cantidadNueva: m.cantidadNueva,
        fechaCambio: m.fechaCambio.toISOString(),
        usuario: { id: m.usuario.id, nombre: m.usuario.nombre },
      })),
    }));
  }
}
