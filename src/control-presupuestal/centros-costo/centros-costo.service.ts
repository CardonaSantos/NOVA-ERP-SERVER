import { Injectable } from '@nestjs/common';
import { CreateCentrosCostoDto } from './dto/create-centros-costo.dto';
import { UpdateCentrosCostoDto } from './dto/update-centros-costo.dto';

@Injectable()
export class CentrosCostoService {
  create(createCentrosCostoDto: CreateCentrosCostoDto) {
    return 'This action adds a new centrosCosto';
  }

  findAll() {
    return `This action returns all centrosCosto`;
  }

  findOne(id: number) {
    return `This action returns a #${id} centrosCosto`;
  }

  update(id: number, updateCentrosCostoDto: UpdateCentrosCostoDto) {
    return `This action updates a #${id} centrosCosto`;
  }

  remove(id: number) {
    return `This action removes a #${id} centrosCosto`;
  }
}
