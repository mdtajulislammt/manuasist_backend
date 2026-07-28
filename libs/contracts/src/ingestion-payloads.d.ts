export type ScanSubmittedV1Payload = {
    scanId: string;
    userId: string;
    storedFileName?: string;
    contentType?: string;
    menuText?: string;
    imageUrl?: string;
};
export type ScanClassificationCompletedV1Payload = {
    scanId: string;
    userId: string;
    dishCount: number;
    naiScore?: number;
};
export type ScanClassificationFailedV1Payload = {
    scanId: string;
    userId: string;
    error: string;
};
