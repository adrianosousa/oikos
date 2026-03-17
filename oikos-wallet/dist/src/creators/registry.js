/**
 * Creator Registry — Maps creators to their wallet addresses.
 *
 * Creator addresses are public data (published on platform pages
 * or configured by the operator). They are NOT sensitive.
 */
import { readFileSync } from 'fs';
/** Load creator registry from a JSON file */
export function loadCreators(path) {
    try {
        const raw = readFileSync(path, 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        console.error(`[creators] Failed to load ${path}, using demo defaults`);
        return getDemoCreators();
    }
}
/** Demo creator registry for testing */
export function getDemoCreators() {
    return {
        creators: [
            {
                name: 'Demo Creator',
                platform: 'generic',
                addresses: {
                    ethereum: '0xCREATOR1000000000000000000000000000000001',
                    bitcoin: 'tb1qmockcreator00000000000000000000dead',
                },
            },
        ],
    };
}
/** Get the default creator for a given chain */
export function getDefaultCreator(registry, chain) {
    const creator = registry.creators[0];
    if (creator && creator.addresses[chain]) {
        return creator;
    }
    return undefined;
}
//# sourceMappingURL=registry.js.map