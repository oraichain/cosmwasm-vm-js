import { eddsa } from 'elliptic';

export * from './types';
export * from './memory';
export * from './backend';
export * from './instance';
export * from './environment';

import { VMInstance } from './instance';
VMInstance.eddsa = new eddsa('ed25519');
