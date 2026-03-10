import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { CreditoCuotaService } from './credito-cuota.service';
import { CreateCreditoCuotaDto } from './dto/create-credito-cuota.dto';
import { UpdateCreditoCuotaDto } from './dto/update-credito-cuota.dto';

@Controller('credito-cuota')
export class CreditoCuotaController {
  constructor(private readonly creditoCuotaService: CreditoCuotaService) {}

  @Post()
  create(@Body() createCreditoCuotaDto: CreateCreditoCuotaDto) {
    return this.creditoCuotaService.create(createCreditoCuotaDto);
  }

  @Get()
  async findActivos() {
    return this.creditoCuotaService.findActivosConCuotasPendientes();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.creditoCuotaService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateCreditoCuotaDto: UpdateCreditoCuotaDto,
  ) {
    return this.creditoCuotaService.update(+id, updateCreditoCuotaDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.creditoCuotaService.remove(+id);
  }
}
