import { Injectable } from '@nestjs/common';
import { MenuScanStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardStats(topUsersLimit = 10) {
    const [totalScans, topUsers] = await Promise.all([
      this.prisma.menuScan.count({
        where: { status: MenuScanStatus.COMPLETED },
      }),
      this.prisma.userDietPattern.findMany({
        where: { scanCount: { gt: 0 } },
        orderBy: [{ scanCount: 'desc' }, { avgNaiScore: 'desc' }],
        take: topUsersLimit,
        select: {
          userId: true,
          scanCount: true,
          avgNaiScore: true,
        },
      }),
    ]);

    return {
      totalScans,
      topUsers: topUsers.map((row) => ({
        userId: row.userId,
        scanCount: row.scanCount,
        avgNaiScore:
          row.avgNaiScore === null ? null : Math.round(row.avgNaiScore),
      })),
    };
  }
}
