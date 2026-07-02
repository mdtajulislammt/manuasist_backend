import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionListController } from './subscription-list.controller';
import { SubscriptionListService } from './subscription-list.service';

describe('SubscriptionListController', () => {
  let controller: SubscriptionListController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionListController],
      providers: [
        {
          provide: SubscriptionListService,
          useValue: { list: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<SubscriptionListController>(SubscriptionListController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
