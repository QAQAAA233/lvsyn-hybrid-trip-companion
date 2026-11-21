export interface CloudEmulatorRequestRecord {
  url: string | undefined;
  hasAppCheckHeader: boolean;
  appCheckHeader: string | string[] | null;
  googApiClient: string | string[] | null;
  timestamp: number;
}

export interface CloudEmulatorHandle {
  port: number;
  url: string;
  getRequests: () => CloudEmulatorRequestRecord[];
  resetRequests: () => void;
  close: () => Promise<void>;
}

export function startCloudEmulatorServer(port?: number): Promise<CloudEmulatorHandle>;
