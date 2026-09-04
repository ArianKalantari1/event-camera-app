export interface PresignedUpload {
  /** Where the browser PUTs the bytes. */
  url: string;
  method: 'PUT';
  /**
   * Headers the browser must send verbatim. The S3 signature covers
   * Content-Type, so a mismatch here is a 403 at upload time rather than a
   * confusing failure later.
   */
  headers: Record<string, string>;
  expiresInSeconds: number;
}

export interface ObjectInfo {
  bytes: number;
  mime: string | null;
}

/**
 * The storage contract. Deliberately small and expressed only in terms the
 * plain S3 API supports, so the provider decision stays reversible: R2 today,
 * S3 or Azure-with-an-S3-gateway later, with no call-site changes.
 */
export interface StorageDriver {
  readonly name: 'local' | 's3';
  /**
   * Five minutes, not fifteen. The window only has to cover one photo upload on
   * bad wifi, and a signed write capability should not outlive its purpose by
   * more than it must.
   */
  presignUpload(key: string, contentType: string, expiresInSeconds?: number): Promise<PresignedUpload>;
  /** Short-lived read URL. Callers must authorize BEFORE minting one. */
  signedReadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  /** Null when the object is absent — used to verify an upload actually landed. */
  head(key: string): Promise<ObjectInfo | null>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<number>;
}
