import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  UsePipes,
  ValidationPipe,
  ParseIntPipe,
} from '@nestjs/common';
import { CreditoService } from './credito.service';
import { CreateCreditoDto } from './dto/create-credito.dto';
import { CreditoQuery } from './query/query';

@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
  }),
)
@Controller('credito')
export class CreditoController {
  constructor(private readonly creditoService: CreditoService) {}

  @Post()
  create(@Body() createCreditoDto: CreateCreditoDto) {
    return this.creditoService.create(createCreditoDto);
  }

  @Get() // <-- agrega esto
  findAll(@Query() query: CreditoQuery) {
    return this.creditoService.findAll(query);
  }

  @Get('credito-details/:id')
  getOneCredito(@Param('id', ParseIntPipe) id: number) {
    return this.creditoService.getOneCredito(id);
  }

  @Get('simple-credit-dashboard')
  getSimpleCredits() {
    return this.creditoService.getSimpleCredits();
  }

  @Delete('delete-credito/:id')
  deleteCredito(@Param('id', ParseIntPipe) id: number) {
    return this.creditoService.deleteOneCredito(id);
  }
}
