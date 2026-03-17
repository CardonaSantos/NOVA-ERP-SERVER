import { Test, TestingModule } from '@nestjs/testing';
import { PartidasController } from './presentation/partidas.controller';
import { PartidasService } from './app/partidas.service';

describe('PartidasController', () => {
  let controller: PartidasController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PartidasController],
      providers: [PartidasService],
    }).compile();

    controller = module.get<PartidasController>(PartidasController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
