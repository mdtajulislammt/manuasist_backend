import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';

@Injectable()
export class UsersService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
    ) { }

    async getAll(page?: number, limit?: number, sort?: string, order?: string) {
        const base = this.config
            .getOrThrow<string>('AUTH_SERVICE_URL')
            .replace(/\/$/, '');
        const key = this.config.getOrThrow<string>('AUTH_INTERNAL_API_KEY');

        const params = new URLSearchParams();
        if (page !== undefined) params.append('page', page.toString());
        if (limit !== undefined) params.append('limit', limit.toString());
        if (sort !== undefined) params.append('sort', sort);
        if (order !== undefined) params.append('order', order);

        const url = `${base}/internal/auth/users?${params.toString()}`;

        try {
            const res = await fetch(url, {
                headers: { 'x-internal-api-key': key },
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Auth service returned ${res.status}: ${text}`);
            }
            return await res.json();
        } catch (error: any) {
            throw new Error(`Failed to fetch users: ${error.message}`);
        }
    }


    async getUserById(userId: string) {
        const base = this.config
            .getOrThrow<string>('AUTH_SERVICE_URL')
            .replace(/\/$/, '');
        const key = this.config.getOrThrow<string>('AUTH_INTERNAL_API_KEY');

        const url = `${base}/internal/auth/users/${userId}`;

        try {
            const res = await fetch(url, {
                headers: { 'x-internal-api-key': key },
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Auth service returned ${res.status}: ${text}`);
            }
            return await res.json();
        } catch (error: any) {
            throw new Error(`Failed to fetch user by ID: ${error.message}`);
        }
    }


    async toggleUserStatus(userId: string) {
        const base = this.config
            .getOrThrow<string>('AUTH_SERVICE_URL')
            .replace(/\/$/, '');
        const key = this.config.getOrThrow<string>('AUTH_INTERNAL_API_KEY');

        const url = `${base}/internal/auth/users/${userId}/status`;

        try {
            const res = await fetch(url, {
                method: 'PATCH',
                headers: { 'x-internal-api-key': key },
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Auth service returned ${res.status}: ${text}`);
            }
            return await res.json();
        } catch (error: any) {
            throw new Error(`Failed to toggle user status: ${error.message}`);
        }
    }
}
