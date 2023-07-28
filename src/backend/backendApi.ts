import { fromBech32, normalizeBech32 } from '@cosmjs/encoding';
import bech32 from 'bech32';

export interface IGasInfo {
  cost: number;
  externally_used: number;
}

export class GasInfo implements IGasInfo {
  constructor(public cost: number, public externally_used: number) {}

  static with_cost(cost: number): IGasInfo {
    return new GasInfo(cost, 0);
  }

  static with_externally_used(externally_used: number): IGasInfo {
    return new GasInfo(0, externally_used);
  }

  static free(): IGasInfo {
    return new GasInfo(0, 0);
  }
}

export interface IBackendApi {
  bech32_prefix: string;
  canonical_address(human: string): Uint8Array;
  human_address(canonical: Uint8Array): string;
  poseidon_hash(
    left_input: Uint8Array,
    right_input: Uint8Array,
    curve: number
  ): Uint8Array;
  curve_hash(input: Uint8Array, curve: number): Uint8Array;
  groth16_verify(
    input: Uint8Array,
    proof: Uint8Array,
    vk: Uint8Array,
    curve: number
  ): boolean;
  keccak_256(input: Uint8Array): Uint8Array;
  sha256(input: Uint8Array): Uint8Array;
}

export const GAS_COST_HUMANIZE = 44;
export const GAS_COST_CANONICALIZE = 55;

export class BasicBackendApi implements IBackendApi {
  public CANONICAL_LENGTH = 54;
  public EXCESS_PADDING = 6;

  constructor(public bech32_prefix: string = 'terra') {}

  poseidon_hash(
    left_input: Uint8Array,
    right_input: Uint8Array,
    curve: number
  ): Uint8Array {
    throw new Error('Method not implemented.');
  }
  curve_hash(input: Uint8Array, curve: number): Uint8Array {
    throw new Error('Method not implemented.');
  }
  groth16_verify(
    input: Uint8Array,
    proof: Uint8Array,
    vk: Uint8Array,
    curve: number
  ): boolean {
    throw new Error('Method not implemented.');
  }
  keccak_256(input: Uint8Array): Uint8Array {
    throw new Error('Method not implemented.');
  }
  sha256(input: Uint8Array): Uint8Array {
    throw new Error('Method not implemented.');
  }

  public canonical_address(human: string): Uint8Array {
    if (human.length === 0) {
      throw new Error('Empty human address');
    }

    const normalized = normalizeBech32(human);

    if (normalized.length < 3) {
      throw new Error(`canonical_address: Address too short: ${normalized}`);
    }

    if (normalized.length > this.CANONICAL_LENGTH) {
      throw new Error(`canonical_address: Address too long: ${normalized}`);
    }

    return fromBech32(normalized).data;
  }

  public human_address(canonical: Uint8Array): string {
    if (canonical.length === 0) {
      throw new Error('human_address: Empty canonical address');
    }

    // Remove excess padding, otherwise bech32.encode will throw "Exceeds length limit"
    // error when normalized is greater than 48 in length.
    const normalized =
      canonical.length - this.EXCESS_PADDING >= 48
        ? canonical.slice(0, this.CANONICAL_LENGTH - this.EXCESS_PADDING)
        : canonical;
    return bech32.encode(this.bech32_prefix, bech32.toWords(normalized));
  }
}
