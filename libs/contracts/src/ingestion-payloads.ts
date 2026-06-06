/** Payload for RMQ routing key `scan.submitted.v1` */
export type ScanSubmittedV1Payload = {
  scanId: string;
  userId: string;
  /** Stored platform file name in MENU_SCAN namespace */
  storedFileName?: string;
  contentType?: string;
  /** Dev / text-only scans — skips OCR */
  menuText?: string;
  /** Server-built public path; legacy scans may still set this */
  imageUrl?: string;
};

/** Payload for `scan.classification_completed.v1` */
export type ScanClassificationCompletedV1Payload = {
  scanId: string;
  userId: string;
  dishCount: number;
  naiScore?: number;
};

/** Payload for `scan.classification_failed.v1` */
export type ScanClassificationFailedV1Payload = {
  scanId: string;
  userId: string;
  error: string;
};
