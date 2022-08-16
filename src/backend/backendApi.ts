import { fromBech32, normalizeBech32, toBech32 } from '@cosmjs/encoding';

export interface IGasInfo {
  cost: number;
  externally_used: number;

  with_cost(cost: number): IGasInfo;

  with_externally_used(externally_used: number): IGasInfo;

  free(): IGasInfo;
}

export class GasInfo implements IGasInfo {
  constructor(public cost: number, public externally_used: number) {}

  with_cost(cost: number): IGasInfo {
    return new GasInfo(cost, 0);
  }

  with_externally_used(externally_used: number): IGasInfo {
    return new GasInfo(0, externally_used);
  }

  free(): IGasInfo {
    return new GasInfo(0, 0);
  }
}

export interface IBackendApi {
  canonical_address(human: string): Uint8Array;

  human_address(canonical: Uint8Array): string;
}

export class BasicBackendApi implements BasicBackendApi {
  // public GAS_COST_CANONICALIZE = 55;
  public CANONICAL_LENGTH = 54;

  constructor(public bech32_prefix: string = 'terra') {}

  public canonical_address(human: string): Uint8Array {
    if (human.length === 0) {
      throw new Error('Empty human address');
    }

    const normalized = normalizeBech32(human);

    if (normalized.length < 3) {
      throw new Error(`Address too short: ${normalized}`);
    }

    if (normalized.length > this.CANONICAL_LENGTH) {
      throw new Error(`Address too long: ${normalized}`);
    }

    return fromBech32(normalized).data;
  }

  public human_address(canonical: Uint8Array): string {
    if (canonical.length === 0) {
      throw new Error('Empty canonical address');
    }

    if (canonical.length != this.CANONICAL_LENGTH) {
      throw new Error(
        `Invalid input: canonical address length not correct: ${canonical.length}`
      );
    }

    return toBech32(this.bech32_prefix, canonical);
  }
}