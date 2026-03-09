/**
 * Type declarations for Hyperswarm ecosystem modules.
 * These packages are JS-only with no @types packages.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

declare module 'hyperswarm' {
  class Hyperswarm {
    constructor(opts?: Record<string, any>);
    join(topic: Buffer, opts?: { server?: boolean; client?: boolean }): { flushed(): Promise<void> };
    leave(topic: Buffer): Promise<void>;
    on(event: string, handler: (...args: any[]) => void): this;
    destroy(): Promise<void>;
    keyPair: { publicKey: Buffer; secretKey: Buffer };
  }
  export default Hyperswarm;
}

declare module 'protomux' {
  class Protomux {
    static from(stream: any): Protomux;
    createChannel(opts: Record<string, any>): any;
    destroy(): void;
  }
  export default Protomux;
}

declare module 'compact-encoding' {
  const c: { raw: { preencode: any; encode: any; decode: any } };
  export default c;
}

declare module 'b4a' {
  const b4a: {
    from(input: string | Buffer | Uint8Array, encoding?: string): Buffer;
    alloc(size: number, fill?: number): Buffer;
    concat(buffers: Buffer[]): Buffer;
    toString(buf: Buffer, encoding?: string): string;
    isBuffer(value: unknown): value is Buffer;
    equals(a: Buffer, b: Buffer): boolean;
  };
  export default b4a;
}

declare module 'sodium-universal' {
  const sodium: {
    crypto_generichash(output: Buffer, input: Buffer, key?: Buffer): void;
    crypto_generichash_BYTES: number;
    crypto_generichash_KEYBYTES: number;
    crypto_generichash_KEYBYTES_MIN: number;
    crypto_generichash_KEYBYTES_MAX: number;
    crypto_sign_keypair(publicKey: Buffer, secretKey: Buffer): void;
    crypto_sign_PUBLICKEYBYTES: number;
    crypto_sign_SECRETKEYBYTES: number;
  };
  export default sodium;
}

declare module 'hyperdht' {
  class HyperDHT {
    static keyPair(): { publicKey: Buffer; secretKey: Buffer };
    static testnet(size?: number): Promise<{ bootstrap: Array<{ host: string; port: number }>; nodes: any[] }>;
  }
  export default HyperDHT;
}
