import { Test, TestingModule } from '@nestjs/testing';
import { PresupuestosService } from './app/presupuestos.service';

describe('PresupuestosService', () => {
  let service: PresupuestosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PresupuestosService],
    }).compile();

    service = module.get<PresupuestosService>(PresupuestosService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
