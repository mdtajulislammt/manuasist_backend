/** Payload for RMQ routing key `scan.submitted.v1` */
export type ScanSubmittedV1Payload = {
  scanId: string;
  userId: string;
  imageUrl: string;
};

/** Payload for `scan.classification_completed.v1` */
export type ScanClassificationCompletedV1Payload = {
  scanId: string;
  userId: string;
  dishCount: number;
};
