/**
 * Creator Registry — Maps creators to their wallet addresses.
 *
 * Creator addresses are public data (published on platform pages
 * or configured by the operator). They are NOT sensitive.
 */

import { readFileSync } from 'fs';

export interface Creator {
  name: string;
  platform: string;
  addresses: Record<string, string>; // chain → address
}

export interface CreatorRegistry {
  creators: Creator[];
}

/** Load creator registry from a JSON file */
export function loadCreators(path: string): CreatorRegistry {
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as CreatorRegistry;
  } catch {
    console.error(`[creators] Failed to load ${path}, using demo defaults`);
    return getDemoCreators();
  }
}

/** Demo creator registry for testing */
export function getDemoCreators(): CreatorRegistry {
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
export function getDefaultCreator(registry: CreatorRegistry, chain: string): Creator | undefined {
  const creator = registry.creators[0];
  if (creator && creator.addresses[chain]) {
    return creator;
  }
  return undefined;
}
