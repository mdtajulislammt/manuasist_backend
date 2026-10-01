import {
  isHeicImage,
  resolveAvatarContentType,
} from './profile-avatar-content.util';

describe('resolveAvatarContentType', () => {
  const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

  it('accepts reported jpeg mime', () => {
    expect(
      resolveAvatarContentType({
        mimetype: 'image/jpeg',
        originalname: 'avatar.bin',
        buffer: jpegHeader,
      }),
    ).toEqual({ mime: 'image/jpeg', ext: '.jpg' });
  });

  it('normalizes image/jpg alias', () => {
    expect(
      resolveAvatarContentType({
        mimetype: 'image/jpg',
        originalname: 'avatar.bin',
        buffer: jpegHeader,
      }),
    ).toEqual({ mime: 'image/jpeg', ext: '.jpg' });
  });

  it('falls back to filename extension when mime is octet-stream', () => {
    expect(
      resolveAvatarContentType({
        mimetype: 'application/octet-stream',
        originalname: 'photo.jpg',
        buffer: jpegHeader,
      }),
    ).toEqual({ mime: 'image/jpeg', ext: '.jpg' });
  });

  it('sniffs jpeg when mime and extension are missing', () => {
    expect(
      resolveAvatarContentType({
        mimetype: '',
        originalname: 'upload',
        buffer: jpegHeader,
      }),
    ).toEqual({ mime: 'image/jpeg', ext: '.jpg' });
  });

  it('returns null for unsupported types', () => {
    expect(
      resolveAvatarContentType({
        mimetype: 'image/gif',
        originalname: 'avatar.gif',
        buffer: Buffer.from('GIF89a'),
      }),
    ).toBeNull();
  });
});

describe('isHeicImage', () => {
  it('detects HEIC container', () => {
    const heic = Buffer.alloc(16);
    heic.write('....ftypheic', 0, 'ascii');
    expect(isHeicImage(heic)).toBe(true);
  });
});
