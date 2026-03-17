import { PartidaPresupuestal } from '../entities/partida.entity';

export const PARTIDA_REPOSITORY = Symbol('PARTIDA_REPOSITORY');

export interface PartidaRepository {
  // Recibe la entidad completa, la guarda y devuelve la entidad con su ID real
  save(partida: PartidaPresupuestal): Promise<PartidaPresupuestal>;

  // Busca por ID y devuelve la Entidad Rica (mapeada) o null
  findById(id: number): Promise<PartidaPresupuestal | null>;

  // Devuelve todas las entidades mapeadas
  findAll(): Promise<PartidaPresupuestal[]>;

  // El update en el repositorio suele recibir la entidad ya modificada
  // o los campos necesarios, pero NUNCA un DTO.
  update(partida: PartidaPresupuestal): Promise<PartidaPresupuestal>;

  // Borrado lógico o físico
  delete(id: number): Promise<void>;
}
