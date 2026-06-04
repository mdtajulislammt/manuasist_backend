import { HttpException, Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  AdminInternalClientService,
  AdminReferralOfferPayload,
  AdminReferralRewardTier,
} from '../admin-internal/admin-internal-client.service';
import { AuthInternalClientService } from '../auth-internal/auth-internal-client.service';
import { PrismaService } from '../prisma.service';

type ReferralTier = {
  friendsRequired: number;
  rewardLabel: string;
  scanCredits: number;
  premiumDays: number;
  sortOrder: number;
};

type ReferralTierProgress = ReferralTier & {
  previousRequiredTotal: number;
  requiredTotal: number;
  currentProgress: number;
  achieved: boolean;
};

const TIERS: ReferralTier[] = [
  { friendsRequired: 1, rewardLabel: '3 scans', scanCredits: 3, premiumDays: 0, sortOrder: 1 },
  { friendsRequired: 5, rewardLabel: '1 week premium', scanCredits: 0, premiumDays: 7, sortOrder: 2 },
  { friendsRequired: 10, rewardLabel: '1 month premium', scanCredits: 0, premiumDays: 30, sortOrder: 3 },
];

@Injectable()
export class ReferralsService {
  constructor(
    private readonly adminInternal: AdminInternalClientService,
    private readonly authInternal: AuthInternalClientService,
    private readonly prisma: PrismaService,
  ) { }

  async getMyReferrals(userId: string) {
    try {
      const summary = await this.authInternal.getReferralSummary(userId);
      const offer = await this.adminInternal.getActiveReferralOffer();
      const tiers = this.activeTiers(offer);
      const tierProgress = this.tierProgress(
        tiers,
        summary.verifiedFriendsJoined,
      );
      const verifiedFriendsJoined = summary.verifiedFriendsJoined;
      const usage = await this.applyNewRewards(
        userId,
        verifiedFriendsJoined,
        tierProgress,
      );
      const nextTier =
        tierProgress.find((tier) => !tier.achieved) ??
        null;
      const referralCode = summary.referralCode ?? '';
      const friendsGoal =
        nextTier?.friendsRequired ??
        tierProgress[tierProgress.length - 1]?.friendsRequired ??
        0;
      const rewardsCard = this.buildRewardsCard({
        currentProgress:
          nextTier?.currentProgress ??
          tierProgress[tierProgress.length - 1]?.friendsRequired ??
          verifiedFriendsJoined,
        friendsGoal,
        freeScansEarned: usage.totalReferralScanCredits,
        nextTier,
      });

      return {
        success: true,
        message: 'Referral summary retrieved successfully',
        data: {
          referralCodeCard: {
            code: referralCode,
            shareLink: this.buildShareLink(referralCode, offer),
          },
          rewardsCard,
          rewardTiers: {
            title: 'Reward Tiers:',
            items: tierProgress.map((tier) => ({
              label: this.friendCountLabel(tier.friendsRequired),
              reward: tier.rewardLabel,
              achieved: tier.achieved,
            })),
          },
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to get referral summary');
    }
  }

  private async applyNewRewards(
    userId: string,
    verifiedFriendsJoined: number,
    tiers: ReferralTierProgress[],
  ) {
    const current = await this.prisma.userUsageCredit.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    const newTiers = tiers.filter(
      (tier) =>
        tier.requiredTotal > current.referralFriendsRewarded &&
        verifiedFriendsJoined >= tier.requiredTotal,
    );
    if (newTiers.length === 0) {
      return current;
    }

    const scanCredits = newTiers.reduce(
      (sum, tier) => sum + tier.scanCredits,
      0,
    );
    const premiumDays = newTiers.reduce(
      (sum, tier) => sum + tier.premiumDays,
      0,
    );
    const premiumBase =
      current.premiumUntil && current.premiumUntil.getTime() > Date.now()
        ? current.premiumUntil
        : new Date();
    const premiumUntil =
      premiumDays > 0
        ? new Date(premiumBase.getTime() + premiumDays * 24 * 60 * 60 * 1000)
        : current.premiumUntil;
    const maxAwarded = Math.max(...newTiers.map((tier) => tier.requiredTotal));

    return this.prisma.userUsageCredit.update({
      where: { userId },
      data: {
        freeScanCredits: { increment: scanCredits },
        totalReferralScanCredits: { increment: scanCredits },
        referralFriendsRewarded: maxAwarded,
        premiumUntil,
      },
    });
  }

  private activeTiers(offer: AdminReferralOfferPayload | null): ReferralTier[] {
    const source = offer?.tiers.length ? offer.tiers : TIERS;
    return source
      .map((tier) => this.normalizeTier(tier))
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.friendsRequired - b.friendsRequired,
      );
  }

  private normalizeTier(tier: ReferralTier | AdminReferralRewardTier): ReferralTier {
    return {
      friendsRequired: tier.friendsRequired,
      rewardLabel: tier.rewardLabel,
      scanCredits: tier.scanCredits,
      premiumDays: tier.premiumDays,
      sortOrder: tier.sortOrder,
    };
  }

  private tierProgress(
    tiers: ReferralTier[],
    verifiedFriendsJoined: number,
  ): ReferralTierProgress[] {
    let requiredTotal = 0;
    return tiers.map((tier) => {
      const previousRequiredTotal = requiredTotal;
      requiredTotal += tier.friendsRequired;
      return {
        ...tier,
        previousRequiredTotal,
        requiredTotal,
        currentProgress: Math.max(
          0,
          Math.min(
            tier.friendsRequired,
            verifiedFriendsJoined - previousRequiredTotal,
          ),
        ),
        achieved: verifiedFriendsJoined >= requiredTotal,
      };
    });
  }

  private buildRewardsCard(input: {
    currentProgress: number;
    friendsGoal: number;
    freeScansEarned: number;
    nextTier: ReferralTierProgress | null;
  }) {
    const progressPercent =
      input.friendsGoal > 0
        ? Math.min(
          100,
          Math.round((input.currentProgress / input.friendsGoal) * 100),
        )
        : 100;

    return {
      friendsJoinedValue: `${input.currentProgress}/${input.friendsGoal}`,
      friendsJoined: input.currentProgress,
      friendsGoal: input.friendsGoal,
      progressPercent,
      progressRatio: input.friendsGoal > 0 ? progressPercent / 100 : 1,
      freeScansEarned: input.freeScansEarned,
      nextReward: input.nextTier
        ? {
          title: `Next reward at ${input.nextTier.friendsRequired} invites`,
          label: input.nextTier.rewardLabel,
          atFriends: input.nextTier.friendsRequired,
        }
        : {
          title: 'All rewards achieved',
          label: null,
          atFriends: null,
        },
    };
  }

  private friendCountLabel(count: number): string {
    return `${count} ${count === 1 ? 'friend' : 'friends'}`;
  }

  private buildShareLink(
    referralCode: string,
    offer: AdminReferralOfferPayload | null,
  ): string {
    const base =
      offer?.shareBaseUrl ??
      process.env.REFERRAL_SHARE_BASE_URL ??
      process.env.API_GATEWAY_PUBLIC_URL ??
      'https://menu-assist.anikstudio.com';
    return `${base.replace(/\/$/, '')}/r/${encodeURIComponent(referralCode)}`;
  }
}
