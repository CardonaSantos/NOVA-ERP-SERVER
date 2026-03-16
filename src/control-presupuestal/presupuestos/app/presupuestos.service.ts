import { Injectable } from '@nestjs/common';
import { CreatePresupuestoDto } from '../dto/create-presupuesto.dto';
import { UpdatePresupuestoDto } from '../dto/update-presupuesto.dto';

@Injectable()
export class PresupuestosService {
  create(createPresupuestoDto: CreatePresupuestoDto) {
    return 'This action adds a new presupuesto';
  }

  findAll() {
    return `This action returns all presupuestos`;
  }

  findOne(id: number) {
    return `This action returns a #${id} presupuesto`;
  }

  update(id: number, updatePresupuestoDto: UpdatePresupuestoDto) {
    return `This action updates a #${id} presupuesto`;
  }

  remove(id: number) {
    return `This action removes a #${id} presupuesto`;
  }
}
