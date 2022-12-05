import { eddsa as ellipticEddsa } from 'elliptic';

declare global {
  var _eddsa: ellipticEddsa; // we use a global to prevent serialization issues for the calling class
  function eddsa(): ellipticEddsa;
  function poseidon_hash(inputs: Uint8Array[]): Uint8Array;
  function curve_hash(input: Uint8Array): Uint8Array;
  function groth16_verify(
    input: Uint8Array,
    proof: Uint8Array,
    vk: Uint8Array
  ): boolean;
}

export {};
