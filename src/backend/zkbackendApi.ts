import {
  Poseidon,
  curve_hash,
  groth16_verify,
  keccak_256,
  sha256,
} from '@oraichain/cosmwasm-vm-zk-nodejs';
import { BasicBackendApi } from './backendApi';

const poseidon = new Poseidon();

export class ZkBackendApi extends BasicBackendApi {
  poseidon_hash(
    left_input: Uint8Array,
    right_input: Uint8Array,
    curve: number
  ): Uint8Array {
    return poseidon.hash(left_input, right_input, curve);
  }
  curve_hash(input: Uint8Array, curve: number): Uint8Array {
    return curve_hash(input, curve);
  }
  groth16_verify(
    input: Uint8Array,
    proof: Uint8Array,
    vk: Uint8Array,
    curve: number
  ): boolean {
    return groth16_verify(input, proof, vk, curve);
  }
  keccak_256(input: Uint8Array): Uint8Array {
    return keccak_256(input);
  }
  sha256(input: Uint8Array): Uint8Array {
    return sha256(input);
  }
}
