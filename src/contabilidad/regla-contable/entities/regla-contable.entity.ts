import {
  ClasificacionAdmin,
  MetodoPago,
  MotivoMovimiento,
  OrigenAsientoContable,
} from '@prisma/client';

export class ReglaContable {
  private readonly id: number;
  private codigo: string;

  private nombre: string;
  private descripcion?: string;

  private origen: OrigenAsientoContable;
  private clasificacion?: ClasificacionAdmin;
  private motivo?: MotivoMovimiento;
  private metodoPago?: MetodoPago;

  private cuentaDebeId: number;
  private cuentaHaberId: number;

  private usaCentroCosto: boolean;
  private usaPartidaPresupuestal: boolean;

  private activa: boolean;
  private prioridad: number;

  constructor(
    id: number,
    codigo: string,
    nombre: string,
    origen: OrigenAsientoContable,
    cuentaDebeId: number,
    cuentaHaberId: number,
    prioridad: number = 1,
    activa: boolean = true,
    descripcion?: string,
    clasificacion?: ClasificacionAdmin,
    motivo?: MotivoMovimiento,
    metodoPago?: MetodoPago,
    usaCentroCosto: boolean = false,
    usaPartidaPresupuestal: boolean = false,
  ) {
    this.validateCodigo(codigo);
    this.validateNombre(nombre);
    this.validateCuentas(cuentaDebeId, cuentaHaberId);
    this.validatePrioridad(prioridad);

    this.id = id;
    this.codigo = codigo;
    this.nombre = nombre;
    this.descripcion = descripcion;

    this.origen = origen;
    this.clasificacion = clasificacion;
    this.motivo = motivo;
    this.metodoPago = metodoPago;

    this.cuentaDebeId = cuentaDebeId;
    this.cuentaHaberId = cuentaHaberId;

    this.usaCentroCosto = usaCentroCosto;
    this.usaPartidaPresupuestal = usaPartidaPresupuestal;

    this.prioridad = prioridad;
    this.activa = activa;
  }

  // ========================
  // GETTERS
  // ========================

  getId() {
    return this.id;
  }
  getCodigo() {
    return this.codigo;
  }
  getNombre() {
    return this.nombre;
  }
  getDescripcion() {
    return this.descripcion;
  }

  getOrigen() {
    return this.origen;
  }
  getClasificacion() {
    return this.clasificacion;
  }
  getMotivo() {
    return this.motivo;
  }
  getMetodoPago() {
    return this.metodoPago;
  }

  getCuentaDebeId() {
    return this.cuentaDebeId;
  }
  getCuentaHaberId() {
    return this.cuentaHaberId;
  }

  getPrioridad() {
    return this.prioridad;
  }

  usaCentroCostos() {
    return this.usaCentroCosto;
  }
  usaPartidaPresupuesto() {
    return this.usaPartidaPresupuestal;
  }

  estaActiva() {
    return this.activa;
  }

  // ========================
  // COMPORTAMIENTO
  // ========================

  cambiarNombre(nombre: string) {
    this.validateNombre(nombre);
    this.nombre = nombre;
  }

  cambiarDescripcion(desc?: string) {
    if (desc && desc.length < 3) {
      throw new Error('Descripción muy corta');
    }
    this.descripcion = desc;
  }

  cambiarCodigo(codigo: string) {
    if (!codigo || codigo.trim().length < 3) {
      throw new Error('Código inválido');
    }

    this.codigo = codigo.trim(); // ✅ aquí está el cambio real
  }

  cambiarCuentas(debeId: number, haberId: number) {
    this.validateCuentas(debeId, haberId);
    this.cuentaDebeId = debeId;
    this.cuentaHaberId = haberId;
  }

  cambiarContexto(params: {
    clasificacion?: ClasificacionAdmin;
    motivo?: MotivoMovimiento;
    metodoPago?: MetodoPago;
  }) {
    this.clasificacion = params.clasificacion;
    this.motivo = params.motivo;
    this.metodoPago = params.metodoPago;
  }

  cambiarPrioridad(prioridad: number) {
    this.validatePrioridad(prioridad);
    this.prioridad = prioridad;
  }

  activar() {
    // if (this.activa) throw new Error('Ya activa');
    this.activa = true;
  }

  desactivar() {
    // if (!this.activa) throw new Error('Ya inactiva');
    this.activa = false;
  }

  // ========================
  // LÓGICA CLAVE 🔥
  // ========================

  public aplica(contexto: {
    origen: OrigenAsientoContable;
    clasificacion?: ClasificacionAdmin;
    motivo?: MotivoMovimiento;
    metodoPago?: MetodoPago;
  }): boolean {
    if (!this.activa) return false;

    if (this.origen !== contexto.origen) return false;

    if (this.clasificacion && this.clasificacion !== contexto.clasificacion) {
      return false;
    }

    if (this.motivo && this.motivo !== contexto.motivo) {
      return false;
    }

    if (this.metodoPago && this.metodoPago !== contexto.metodoPago) {
      return false;
    }

    return true;
  }

  // ========================
  // VALIDACIONES
  // ========================

  private validateCodigo(codigo: string) {
    if (!codigo || codigo.trim().length < 3) {
      throw new Error('Código inválido');
    }
  }

  private validateNombre(nombre: string) {
    if (!nombre || nombre.trim().length < 3) {
      throw new Error('Nombre inválido');
    }
  }

  private validateCuentas(debe: number, haber: number) {
    if (!debe || !haber) {
      throw new Error('Cuentas inválidas');
    }
    if (debe === haber) {
      throw new Error('Debe y Haber no pueden ser iguales');
    }
  }

  private validatePrioridad(p: number) {
    if (p < 1) {
      throw new Error('Prioridad inválida');
    }
  }
}
