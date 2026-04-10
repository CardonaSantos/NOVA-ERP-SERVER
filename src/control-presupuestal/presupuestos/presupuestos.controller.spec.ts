import { Test, TestingModule } from '@nestjs/testing';
import { PresupuestosController } from './presentation/presupuestos.controller';
import { PresupuestosService } from './app/presupuestos.service';

describe('PresupuestosController', () => {
  let controller: PresupuestosController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PresupuestosController],
      providers: [PresupuestosService],
    }).compile();

    controller = module.get<PresupuestosController>(PresupuestosController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
