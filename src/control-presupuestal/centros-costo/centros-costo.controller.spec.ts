import { Test, TestingModule } from '@nestjs/testing';
import { CentrosCostoController } from './centros-costo.controller';
import { CentrosCostoService } from './centros-costo.service';

describe('CentrosCostoController', () => {
  let controller: CentrosCostoController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CentrosCostoController],
      providers: [CentrosCostoService],
    }).compile();

    controller = module.get<CentrosCostoController>(CentrosCostoController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
