const ALLOWED_AVATAR_MIME = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
]);

const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
};

const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export function resolveAvatarContentType(input: {
  mimetype: string;
  originalname: string;
  buffer: Buffer;
}): { mime: string; ext: string } | null {
  const reported = normalizeMime(input.mimetype);
  const fromReported = mimeToExt(reported);
  if (fromReported) {
    return fromReported;
  }

  const fromExtension = extFromFilename(input.originalname);
  if (fromExtension) {
    return fromExtension;
  }

  const sniffed = sniffImageMime(input.buffer);
  if (sniffed) {
    return sniffed;
  }

  return null;
}

export function isHeicImage(buffer: Buffer): boolean {
  if (buffer.length < 12) {
    return false;
  }
  const ftyp = buffer.subarray(4, 8).toString('ascii');
  if (ftyp !== 'ftyp') {
    return false;
  }
  const brand = buffer.subarray(8, 12).toString('ascii').toLowerCase();
  return (
    brand.startsWith('heic') ||
    brand.startsWith('heix') ||
    brand.startsWith('hevc') ||
    brand.startsWith('mif1')
  );
}

function normalizeMime(raw: string): string {
  const mime = (raw || '').toLowerCase().split(';')[0]?.trim() ?? '';
  return MIME_ALIASES[mime] ?? mime;
}

function mimeToExt(mime: string): { mime: string; ext: string } | null {
  const ext = ALLOWED_AVATAR_MIME.get(mime);
  return ext ? { mime, ext } : null;
}

function extFromFilename(originalname: string): { mime: string; ext: string } | null {
  const match = originalname.toLowerCase().match(/(\.[a-z0-9]+)$/);
  if (!match) {
    return null;
  }
  const ext = match[1];
  const mime = EXT_TO_MIME[ext];
  if (!mime) {
    return null;
  }
  return { mime, ext: ALLOWED_AVATAR_MIME.get(mime)! };
}

function sniffImageMime(buffer: Buffer): { mime: string; ext: string } | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { mime: 'image/jpeg', ext: '.jpg' };
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { mime: 'image/png', ext: '.png' };
  }
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: '.webp' };
  }
  return null;
}
