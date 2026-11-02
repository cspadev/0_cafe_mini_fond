import type { Config } from './types';
import raw from '../game.config.json';

/** The tunable game configuration (game.config.json). */
export const config = raw as unknown as Config;
