import { Test, TestingModule } from '@nestjs/testing';
import { CentrosCostoService } from './centros-costo.service';

describe('CentrosCostoService', () => {
  let service: CentrosCostoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CentrosCostoService],
    }).compile();

    service = module.get<CentrosCostoService>(CentrosCostoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
