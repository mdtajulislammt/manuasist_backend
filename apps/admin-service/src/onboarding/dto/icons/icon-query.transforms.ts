import { Transform } from 'class-transformer';

/** First query value (handles `?a=1&a=2`), trim; empty string → undefined. */
export function TransformQueryFirstStringTrim(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null) {
      return undefined;
    }
    const first = Array.isArray(value) ? value[0] : value;
    if (first === undefined || first === null) {
      return undefined;
    }
    const s = String(first).trim();
    return s.length === 0 ? undefined : s;
  });
}

/** `true` / `1` / `yes` → true; `false` / `0` / `no` → false; else undefined. */
export function TransformQueryOptionalTruthyBoolean(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null) {
      return undefined;
    }
    const first = Array.isArray(value) ? value[0] : value;
    if (first === undefined || first === null || first === '') {
      return undefined;
    }
    const s = String(first).toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes') {
      return true;
    }
    if (s === 'false' || s === '0' || s === 'no') {
      return false;
    }
    return undefined;
  });
}
