import { Injectable } from '@nestjs/common';

type Entry = { codeVerifier: string; createdAt: number };

@Injectable()
export class PkceStateStore {
  private readonly map = new Map<string, Entry>();
  private readonly ttlMs = 10 * 60 * 1000;

  set(state: string, codeVerifier: string) {
    this.gc();
    this.map.set(state, { codeVerifier, createdAt: Date.now() });
  }

  take(state: string): string | undefined {
    const v = this.map.get(state);
    this.map.delete(state);
    if (!v) {
      return undefined;
    }
    if (Date.now() - v.createdAt > this.ttlMs) {
      return undefined;
    }
    return v.codeVerifier;
  }

  private gc() {
    const now = Date.now();
    for (const [k, v] of this.map) {
      if (now - v.createdAt > this.ttlMs) {
        this.map.delete(k);
      }
    }
  }
}
