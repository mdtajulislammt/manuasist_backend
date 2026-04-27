export type MenuAssistJwtPayload = {
  sub: string;
  iss?: string;
  aud?: string | string[];
  roles?: string[];
  iat?: number;
  exp?: number;
};
