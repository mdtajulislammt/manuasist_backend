import { AdminInternalClientService } from '../admin-internal/admin-internal-client.service';
import { AuthInternalClientService } from '../auth-internal/auth-internal-client.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma.service';
import { ReferralsService } from './referrals.service';

jest.mock('../../generated/prisma/client', () => ({
  PrismaClient: class {},
}));

describe('ReferralsService', () => {
  const tiers = [
    {
      id: 'tier-1',
      friendsRequired: 1,
      rewardLabel: '3 scans',
      scanCredits: 3,
      premiumDays: 0,
      sortOrder: 1,
    },
    {
      id: 'tier-2',
      friendsRequired: 5,
      rewardLabel: '1 week premium',
      scanCredits: 0,
      premiumDays: 7,
      sortOrder: 2,
    },
    {
      id: 'tier-3',
      friendsRequired: 10,
      rewardLabel: '1 month premium',
      scanCredits: 0,
      premiumDays: 30,
      sortOrder: 3,
    },
  ];
  const admin = {
    getActiveReferralOffer: jest.fn(),
  };
  const auth = {
    getReferralSummary: jest.fn(),
  };
  const tx = {
    userUsageCredit: {
      upsert: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      Promise.resolve(callback(tx)),
    ),
  };
  const notifications = {
    emitReferralUpdated: jest.fn(),
  };
  const service = new ReferralsService(
    admin as unknown as AdminInternalClientService,
    auth as unknown as AuthInternalClientService,
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    admin.getActiveReferralOffer.mockResolvedValue({
      id: 'offer',
      name: 'Default',
      status: 'PUBLISHED',
      isActive: true,
      shareBaseUrl: 'https://example.com',
      publishedAt: new Date().toISOString(),
      tiers,
    });
    auth.getReferralSummary.mockResolvedValue({
      referralCode: 'MENU-ABC',
      verifiedFriendsJoined: 5,
    });
    tx.userUsageCredit.upsert.mockResolvedValue({
      userId: 'user-id',
      freeScanCredits: 0,
      totalReferralScanCredits: 0,
      referralFriendsRewarded: 0,
      premiumUntil: null,
    });
    tx.userUsageCredit.updateMany.mockResolvedValue({ count: 1 });
    tx.userUsageCredit.findUniqueOrThrow.mockResolvedValue({
      userId: 'user-id',
      freeScanCredits: 3,
      totalReferralScanCredits: 3,
      referralFriendsRewarded: 5,
      premiumUntil: new Date(),
    });
  });

  it('treats configured friend counts as absolute milestone thresholds', async () => {
    const result = await service.getMyReferrals('user-id');

    expect(result.data.rewardsCard.friendsJoinedValue).toBe('5/10');
    expect(result.data.rewardTiers.items.map((item) => item.achieved)).toEqual([
      true,
      true,
      false,
    ]);
    expect(tx.userUsageCredit.updateMany).toHaveBeenCalledTimes(1);
  });

  it('does not award milestones that were already recorded', async () => {
    tx.userUsageCredit.upsert.mockResolvedValue({
      userId: 'user-id',
      freeScanCredits: 3,
      totalReferralScanCredits: 3,
      referralFriendsRewarded: 5,
      premiumUntil: new Date(),
    });

    await service.getMyReferrals('user-id');

    expect(tx.userUsageCredit.updateMany).not.toHaveBeenCalled();
  });

  it('recalculates rewards before emitting a live referral update', async () => {
    await service.handleVerifiedReferral('user-id', 'referred-user-id');

    expect(notifications.emitReferralUpdated).toHaveBeenCalledWith(
      'user-id',
      'referred-user-id',
      5,
    );
  });
});
