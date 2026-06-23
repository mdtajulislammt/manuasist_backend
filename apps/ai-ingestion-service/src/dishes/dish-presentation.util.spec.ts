import { resolveDishImageUrl } from './dish-presentation.util';

describe('resolveDishImageUrl', () => {
  const buildMenuScanPublicUrl = (storedName: string) =>
    `https://api.example.com/v1/admin/files/menu-scan/${storedName}`;

  it('prefers dish image when absolute', () => {
    expect(
      resolveDishImageUrl({
        dishImageUrl: 'https://spoonacular.com/dish.jpg',
        scanImageUrl: 'https://api.example.com/scan.jpg',
        scanStoredFileName: 'scan.jpg',
        buildMenuScanPublicUrl,
      }),
    ).toBe('https://spoonacular.com/dish.jpg');
  });

  it('falls back to scan image when dish image is missing', () => {
    expect(
      resolveDishImageUrl({
        dishImageUrl: null,
        scanImageUrl: 'https://api.example.com/v1/admin/files/menu-scan/abc.jpg',
        scanStoredFileName: null,
        buildMenuScanPublicUrl,
      }),
    ).toBe('https://api.example.com/v1/admin/files/menu-scan/abc.jpg');
  });

  it('builds a public url from stored file name', () => {
    expect(
      resolveDishImageUrl({
        dishImageUrl: null,
        scanImageUrl: null,
        scanStoredFileName: 'menu-123.jpg',
        buildMenuScanPublicUrl,
      }),
    ).toBe('https://api.example.com/v1/admin/files/menu-scan/menu-123.jpg');
  });

  it('normalizes bare stored file names', () => {
    expect(
      resolveDishImageUrl({
        dishImageUrl: 'menu-456.jpg',
        scanImageUrl: null,
        scanStoredFileName: null,
        buildMenuScanPublicUrl,
      }),
    ).toBe('https://api.example.com/v1/admin/files/menu-scan/menu-456.jpg');
  });
});
