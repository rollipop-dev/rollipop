export interface HMRContext {
  readonly data: any;
  accept(...args: any[]): void;
  dispose(callback: (data: any) => void): void;
  invalidate(): void;
  on(event: string, listener: (...args: any[]) => void): void;
  off(event: string, listener: (...args: any[]) => void): void;
  send(type: string, payload?: unknown): void;
}

export type HMRClientLogLevel =
  | 'trace'
  | 'info'
  | 'warn'
  | 'error'
  | 'log'
  | 'group'
  | 'groupCollapsed'
  | 'groupEnd'
  | 'debug';

export type HMRClientMessage =
  | {
      type: 'hmr:connected';
      clientId: string;
      bundleEntry: string;
      platform: string;
    }
  | {
      type: 'hmr:payload-delivered';
      filename: string;
    }
  | {
      type: 'hmr:log';
      level: HMRClientLogLevel;
      data: any[];
    };

export type HMRServerMessage =
  | {
      type: 'hmr:update-start';
    }
  | {
      type: 'hmr:update-done';
    }
  | {
      type: 'hmr:update';
      code: string;
      filename: string;
      sourceURL: string;
      changedIds: string[];
      seq: number;
    }
  | {
      type: 'hmr:reload';
    }
  | {
      type: 'hmr:error';
      payload: HMRServerError;
    };

export type HMRCustomMessage = {
  type: string;
  payload: unknown;
};

export type HMRCustomHandler = (socket: WebSocket, message: HMRCustomMessage) => void;

export interface HMRServerError {
  type: string;
  message: string;
  errors: { description: string }[];
}
