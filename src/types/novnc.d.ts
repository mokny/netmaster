declare module "@novnc/novnc" {
  interface RFBCredentials {
    username?: string;
    password?: string;
    target?: string;
  }

  interface RFBOptions {
    shared?: boolean;
    credentials?: RFBCredentials;
    repeaterID?: string;
    wsProtocols?: string[];
  }

  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, urlOrChannel: string, options?: RFBOptions);
    viewOnly: boolean;
    scaleViewport: boolean;
    resizeSession: boolean;
    clipViewport: boolean;
    background: string;
    disconnect(): void;
    sendCredentials(credentials: RFBCredentials): void;
    focus(): void;
    blur(): void;
  }
}
