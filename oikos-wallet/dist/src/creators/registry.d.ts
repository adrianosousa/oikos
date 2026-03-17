/**
 * Creator Registry — Maps creators to their wallet addresses.
 *
 * Creator addresses are public data (published on platform pages
 * or configured by the operator). They are NOT sensitive.
 */
export interface Creator {
    name: string;
    platform: string;
    addresses: Record<string, string>;
}
export interface CreatorRegistry {
    creators: Creator[];
}
/** Load creator registry from a JSON file */
export declare function loadCreators(path: string): CreatorRegistry;
/** Demo creator registry for testing */
export declare function getDemoCreators(): CreatorRegistry;
/** Get the default creator for a given chain */
export declare function getDefaultCreator(registry: CreatorRegistry, chain: string): Creator | undefined;
//# sourceMappingURL=registry.d.ts.map