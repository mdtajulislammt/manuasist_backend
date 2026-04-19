export const API_AUTH_OPTIONS = Symbol('API_AUTH_OPTIONS');

export type ApiAuthModuleOptions = {
  jwksUri: string;
  issuer: string;
  audience: string;
};
