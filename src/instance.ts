/*eslint-disable prefer-const */
import bech32 from 'bech32';
import { eddsa as EllipticEddsa } from 'elliptic';
import { Region } from './memory';
import { ecdsaRecover, ecdsaVerify } from 'secp256k1';
import { meterWASM } from './metering';
import {
  GAS_COST_CANONICALIZE,
  GAS_COST_HUMANIZE,
  GAS_COST_LAST_ITERATION,
  GAS_COST_RANGE,
  GasInfo,
  IBackend,
  Record,
} from './backend';
import { Env, MessageInfo } from './types';
import { toByteArray, toNumber } from './helpers/byte-array';
import {
  getNewResponse,
  getOldEnv,
  getOldInfo,
  OldMessageInfo,
} from './helpers/convert';
import { Environment } from './environment';

export const MAX_LENGTH_DB_KEY: number = 64 * 1024;
export const MAX_LENGTH_DB_VALUE: number = 128 * 1024;
export const MAX_LENGTH_CANONICAL_ADDRESS: number = 64;
export const MAX_LENGTH_HUMAN_ADDRESS: number = 256;

export const MAX_LENGTH_ED25519_SIGNATURE: number = 64;
export const MAX_LENGTH_ED25519_MESSAGE: number = 128 * 1024;
export const EDDSA_PUBKEY_LEN: number = 32;

export class VMInstance {
  // default version
  private _version: number = 8;
  public instance?: WebAssembly.Instance;
  public debugMsgs: string[] = [];

  // override this
  public static eddsa: EllipticEddsa;

  constructor(public backend: IBackend, public readonly env?: Environment) {}

  public async build(wasmByteCode: ArrayBuffer) {
    let imports = {
      env: {
        db_read: this.db_read.bind(this),
        db_write: this.db_write.bind(this),
        db_remove: this.db_remove.bind(this),
        db_scan: this.db_scan.bind(this),
        db_next: this.db_next.bind(this),
        addr_humanize: this.addr_humanize.bind(this),
        addr_canonicalize: this.addr_canonicalize.bind(this),
        addr_validate: this.addr_validate.bind(this),
        secp256k1_verify: this.secp256k1_verify.bind(this),
        secp256k1_recover_pubkey: this.secp256k1_recover_pubkey.bind(this),
        ed25519_verify: this.ed25519_verify.bind(this),
        ed25519_batch_verify: this.ed25519_batch_verify.bind(this),
        curve_hash: this.curve_hash.bind(this),
        poseidon_hash: this.poseidon_hash.bind(this),
        groth16_verify: this.groth16_verify.bind(this),
        keccak_256: this.keccak_256.bind(this),
        sha256: this.sha256.bind(this),
        debug: this.debug.bind(this),
        query_chain: this.query_chain.bind(this),
        abort: this.abort.bind(this),
        // old support
        canonicalize_address: this.addr_canonicalize.bind(this),
        humanize_address: this.do_addr_humanize.bind(this),
      },
    };

    if (this.env) {
      const meteredWasm = meterWASM(wasmByteCode);
      const mod = new WebAssembly.Module(meteredWasm);
      Object.assign(imports, {
        metering: {
          usegas: (gas: number) => {
            if (this.env) {
              let gasInfo = GasInfo.with_cost(gas);
              this.env.process_gas_info(gasInfo);

              if (this.gasUsed > this.gasLimit) {
                throw new Error('out of gas!');
              }
            }
          },
        },
      });
      this.instance = new WebAssembly.Instance(mod, imports);
    } else {
      this.instance = new WebAssembly.Instance(
        new WebAssembly.Module(wasmByteCode),
        imports
      );
    }

    for (const methodName in this.instance!.exports) {
      // support cosmwasm_vm_version_4 (v0.11.0 - v0.13.2)
      if (methodName === 'cosmwasm_vm_version_4') {
        this._version = 4;
        break;
      }
      if (methodName.startsWith('interface_version_')) {
        this._version = Number(methodName.substring(18));
        break;
      }
    }
  }

  public set storageReadonly(value: boolean) {
    this.env?.set_storage_readonly(value);
  }

  public get exports(): any {
    if (!this.instance)
      throw new Error('Please init instance before using methods');
    return this.instance!.exports;
  }

  public get gasUsed() {
    return this.env?.gasUsed ?? 0;
  }

  public get gasLimit() {
    return this.env?.gasLimit ?? 0;
  }

  public get remainingGas() {
    return this.gasLimit - this.gasUsed;
  }

  public allocate(size: number): Region {
    let { allocate, memory } = this.exports;
    let regPtr = allocate(size);
    return new Region(memory, regPtr);
  }

  public deallocate(region: Region): void {
    let { deallocate } = this.exports;
    deallocate(region.ptr);
  }

  public allocate_bytes(bytes: Uint8Array): Region {
    let region = this.allocate(bytes.length);
    region.write(bytes);
    return region;
  }

  public allocate_b64(b64: string): Region {
    let bytes = Buffer.from(b64, 'base64');
    return this.allocate_bytes(bytes);
  }

  public allocate_str(str: string): Region {
    let region = this.allocate(str.length);
    region.write_str(str);
    return region;
  }

  public allocate_json(obj: object): Region {
    let region = this.allocate(JSON.stringify(obj).length);
    region.write_json(obj);
    return region;
  }

  public get version(): number {
    return this._version;
  }

  db_read(key_ptr: number): number {
    let key = this.region(key_ptr);
    return this.do_db_read(key).ptr;
  }

  db_write(key_ptr: number, value_ptr: number) {
    let key = this.region(key_ptr);
    let value = this.region(value_ptr);
    this.do_db_write(key, value);
  }

  db_remove(key_ptr: number) {
    let key = this.region(key_ptr);
    this.do_db_remove(key);
  }

  db_scan(start_ptr: number, end_ptr: number, order: number): number {
    let start = this.region(start_ptr);
    let end = this.region(end_ptr);
    return this.do_db_scan(start, end, order).ptr;
  }

  db_next(iterator_id_ptr: number): number {
    let iterator_id = this.region(iterator_id_ptr);
    return this.do_db_next(iterator_id).ptr;
  }

  addr_canonicalize(source_ptr: number, destination_ptr: number): number {
    let source = this.region(source_ptr);
    let destination = this.region(destination_ptr);
    return this.do_addr_canonicalize(source, destination).ptr;
  }

  addr_humanize(source_ptr: number, destination_ptr: number): number {
    let source = this.region(source_ptr);
    let destination = this.region(destination_ptr);
    return this.do_addr_humanize(source, destination).ptr;
  }

  addr_validate(source_ptr: number): number {
    let source = this.region(source_ptr);
    return this.do_addr_validate(source).ptr;
  }

  secp256k1_verify(
    hash_ptr: number,
    signature_ptr: number,
    pubkey_ptr: number
  ): number {
    let hash = this.region(hash_ptr);
    let signature = this.region(signature_ptr);
    let pubkey = this.region(pubkey_ptr);
    return this.do_secp256k1_verify(hash, signature, pubkey);
  }

  secp256k1_recover_pubkey(
    hash_ptr: number,
    signature_ptr: number,
    recover_param: number
  ): bigint {
    let hash = this.region(hash_ptr);
    let signature = this.region(signature_ptr);
    return BigInt(
      this.do_secp256k1_recover_pubkey(hash, signature, recover_param).ptr
    );
  }

  ed25519_verify(
    message_ptr: number,
    signature_ptr: number,
    pubkey_ptr: number
  ): number {
    let message = this.region(message_ptr);
    let signature = this.region(signature_ptr);
    let pubkey = this.region(pubkey_ptr);
    return this.do_ed25519_verify(message, signature, pubkey);
  }

  ed25519_batch_verify(
    messages_ptr: number,
    signatures_ptr: number,
    public_keys_ptr: number
  ): number {
    let messages = this.region(messages_ptr);
    let signatures = this.region(signatures_ptr);
    let public_keys = this.region(public_keys_ptr);
    return this.do_ed25519_batch_verify(messages, signatures, public_keys);
  }

  curve_hash(
    input_ptr: number,
    curve: number,
    destination_ptr: number
  ): number {
    let input = this.region(input_ptr);
    let destination = this.region(destination_ptr);
    return this.do_curve_hash(input, curve, destination).ptr;
  }

  poseidon_hash(
    left_input_ptr: number,
    right_input_ptr: number,
    curve: number,
    destination_ptr: number
  ): number {
    let left_input = this.region(left_input_ptr);
    let right_input = this.region(right_input_ptr);
    let destination = this.region(destination_ptr);
    return this.do_poseidon_hash(left_input, right_input, curve, destination)
      .ptr;
  }

  groth16_verify(
    input_ptr: number,
    public_ptr: number,
    vk_ptr: number,
    curve: number
  ): number {
    let input = this.region(input_ptr);
    let proof = this.region(public_ptr);
    let vk = this.region(vk_ptr);
    return this.do_groth16_verify(input, proof, vk, curve);
  }

  keccak_256(input_ptr: number, destination_ptr: number): number {
    let input = this.region(input_ptr);
    let destination = this.region(destination_ptr);
    return this.do_keccak_256(input, destination).ptr;
  }

  sha256(input_ptr: number, destination_ptr: number): number {
    let input = this.region(input_ptr);
    let destination = this.region(destination_ptr);
    return this.do_sha256(input, destination).ptr;
  }

  debug(message_ptr: number) {
    let message = this.region(message_ptr);
    this.do_debug(message);
  }

  query_chain(request_ptr: number): number {
    let request = this.region(request_ptr);
    return this.do_query_chain(request).ptr;
  }

  abort(message_ptr: number) {
    let message = this.region(message_ptr);
    this.do_abort(message);
  }

  public region(ptr: number): Region {
    return new Region(this.exports.memory, ptr);
  }

  do_db_read(key: Region): Region {
    let value: Uint8Array | null = this.backend.storage.get(key.data);

    if (key.str.length > MAX_LENGTH_DB_KEY) {
      throw new Error(
        `Key length ${key.str.length} exceeds maximum length ${MAX_LENGTH_DB_KEY}`
      );
    }

    if (this.env) {
      let gasInfo = GasInfo.with_externally_used(key.length);
      this.env.process_gas_info(gasInfo);
    }

    if (value === null) {
      return this.region(0);
    }

    return this.allocate_bytes(value);
  }

  do_db_write(key: Region, value: Region) {
    if (value.str.length > MAX_LENGTH_DB_VALUE) {
      throw new Error(`db_write: value too large: ${value.str}`);
    }

    // throw error for large keys
    if (key.str.length > MAX_LENGTH_DB_KEY) {
      throw new Error(`db_write: key too large: ${key.str}`);
    }

    if (this.env) {
      let gasInfo = GasInfo.with_externally_used(key.length + value.length);
      this.env.process_gas_info(gasInfo);
    }

    this.backend.storage.set(key.data, value.data);
  }

  do_db_remove(key: Region) {
    if (this.env) {
      let gasInfo = GasInfo.with_externally_used(key.length);
      this.env.process_gas_info(gasInfo);
    }
    this.backend.storage.remove(key.data);
  }

  do_db_scan(start: Region, end: Region, order: number): Region {
    const iteratorId: Uint8Array = this.backend.storage.scan(
      start.data,
      end.data,
      order
    );

    if (this.env) {
      let gasInfo = GasInfo.with_externally_used(GAS_COST_RANGE);
      this.env.process_gas_info(gasInfo);
    }

    let region = this.allocate(iteratorId.length);
    region.write(iteratorId);

    return region;
  }

  do_db_next(iterator_id: Region): Region {
    const record: Record | null = this.backend.storage.next(iterator_id.data);

    if (record === null) {
      if (this.env) {
        let gasInfo = GasInfo.with_externally_used(GAS_COST_LAST_ITERATION);
        this.env.process_gas_info(gasInfo);
      }
      return this.allocate_bytes(Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0]));
    }

    // gas cost = key.length + value.length of the item
    if (this.env) {
      let gasInfo = GasInfo.with_externally_used(
        record.key.length + record.value.length
      );
      this.env.process_gas_info(gasInfo);
    }

    // old version following standard: [value,key,key.length]
    if (this.version === 4) {
      return this.allocate_bytes(
        new Uint8Array([
          ...record.value,
          ...record.key,
          ...toByteArray(record.key.length, 4),
        ])
      );
    }

    // separate by 4 bytes [key,key.length,value,value.length]
    return this.allocate_bytes(
      new Uint8Array([
        ...record.key,
        ...toByteArray(record.key.length, 4),
        ...record.value,
        ...toByteArray(record.value.length, 4),
      ])
    );
  }

  do_addr_humanize(source: Region, destination: Region): Region {
    if (source.str.length === 0) {
      throw new Error('Empty address.');
    }

    let result = this.backend.backend_api.human_address(source.data);

    destination.write_str(result);

    if (this.env) {
      let gasInfo = GasInfo.with_cost(GAS_COST_HUMANIZE);
      this.env.process_gas_info(gasInfo);
    }

    return new Region(this.exports.memory, 0);
  }

  do_addr_canonicalize(source: Region, destination: Region): Region {
    let source_data = source.str;

    if (source_data.length === 0) {
      throw new Error('Empty address.');
    }

    let result = this.backend.backend_api.canonical_address(source_data);

    destination.write(result);

    if (this.env) {
      let gasInfo = GasInfo.with_cost(GAS_COST_CANONICALIZE);
      this.env.process_gas_info(gasInfo);
    }

    return new Region(this.exports.memory, 0);
  }

  do_addr_validate(source: Region): Region {
    if (source.str.length === 0) {
      throw new Error('Empty address.');
    }

    if (source.str.length > MAX_LENGTH_HUMAN_ADDRESS) {
      throw new Error(`Address too large: ${source.str}`);
    }

    const canonical = bech32.fromWords(bech32.decode(source.str).words);

    if (canonical.length === 0) {
      throw new Error('Invalid address.');
    }

    const human = bech32.encode(
      this.backend.backend_api.bech32_prefix,
      bech32.toWords(canonical)
    );

    if (this.env) {
      let gasInfo = GasInfo.with_cost(GAS_COST_CANONICALIZE);
      this.env.process_gas_info(gasInfo);
    }

    if (human !== source.str) {
      throw new Error('Invalid address.');
    }
    return new Region(this.exports.memory, 0);
  }

  // Verifies message hashes against a signature with a public key, using the secp256k1 ECDSA parametrization.
  // Returns 0 on verification success, 1 on verification failure
  do_secp256k1_verify(hash: Region, signature: Region, pubkey: Region): number {
    const isValidSignature = ecdsaVerify(
      signature.data,
      hash.data,
      pubkey.data
    );

    if (this.env) {
      let gasInfo = GasInfo.with_cost(this.env.gasConfig.secp256k1_verify_cost);
      this.env.process_gas_info(gasInfo);
    }

    if (isValidSignature) {
      return 0;
    } else {
      return 1;
    }
  }

  do_secp256k1_recover_pubkey(
    msgHash: Region,
    signature: Region,
    recover_param: number
  ): Region {
    const pub = ecdsaRecover(
      signature.data,
      recover_param,
      msgHash.data,
      false
    );

    if (this.env) {
      let gasInfo = GasInfo.with_cost(
        this.env.gasConfig.secp256k1_recover_pubkey_cost
      );
      this.env.process_gas_info(gasInfo);
    }

    return this.allocate_bytes(pub);
  }

  // Verifies a message against a signature with a public key, using the ed25519 EdDSA scheme.
  // Returns 0 on verification success, 1 on verification failure
  do_ed25519_verify(
    message: Region,
    signature: Region,
    pubkey: Region
  ): number {
    if (message.length > MAX_LENGTH_ED25519_MESSAGE) return 1;
    if (signature.length > MAX_LENGTH_ED25519_SIGNATURE) return 1;
    if (pubkey.length > EDDSA_PUBKEY_LEN) return 1;

    const sig = Buffer.from(signature.data).toString('hex');
    const pub = Buffer.from(pubkey.data).toString('hex');
    const msg = Buffer.from(message.data).toString('hex');
    const _signature = VMInstance.eddsa.makeSignature(sig);
    const _pubkey = VMInstance.eddsa.keyFromPublic(pub);

    const isValidSignature = VMInstance.eddsa.verify(msg, _signature, _pubkey);

    if (this.env) {
      let gasInfo = GasInfo.with_cost(this.env.gasConfig.ed25519_verify_cost);
      this.env.process_gas_info(gasInfo);
    }

    if (isValidSignature) {
      return 0;
    } else {
      return 1;
    }
  }

  // Verifies a batch of messages against a batch of signatures with a batch of public keys,
  // using the ed25519 EdDSA scheme.
  // Returns 0 on verification success (all batches verify correctly), 1 on verification failure
  do_ed25519_batch_verify(
    messages_ptr: Region,
    signatures_ptr: Region,
    public_keys_ptr: Region
  ): number {
    let messages = decodeSections(messages_ptr.data);
    let signatures = decodeSections(signatures_ptr.data);
    let publicKeys = decodeSections(public_keys_ptr.data);

    if (
      messages.length === signatures.length &&
      messages.length === publicKeys.length
    ) {
      // Do nothing, we're good to go
    } else if (
      messages.length === 1 &&
      signatures.length == publicKeys.length
    ) {
      const repeated = [];
      for (let i = 0; i < signatures.length; i++) {
        repeated.push(...messages);
      }
      messages = repeated;
    } else if (
      publicKeys.length === 1 &&
      messages.length == signatures.length
    ) {
      const repeated = [];
      for (let i = 0; i < messages.length; i++) {
        repeated.push(...publicKeys);
      }
      publicKeys = repeated;
    } else {
      throw new Error(
        'Lengths of messages, signatures and public keys do not match.'
      );
    }

    if (
      messages.length !== signatures.length ||
      messages.length !== publicKeys.length
    ) {
      throw new Error(
        'Lengths of messages, signatures and public keys do not match.'
      );
    }

    if (this.env) {
      let gasInfo = GasInfo.with_cost(
        this.env.gasConfig.ed25519_batch_verify_cost
      );
      this.env.process_gas_info(gasInfo);
    }

    for (let i = 0; i < messages.length; i++) {
      const message = Buffer.from(messages[i]).toString('hex');
      const signature = Buffer.from(signatures[i]).toString('hex');
      const publicKey = Buffer.from(publicKeys[i]).toString('hex');

      const _signature = VMInstance.eddsa.makeSignature(signature);
      const _publicKey = VMInstance.eddsa.keyFromPublic(publicKey);

      let isValid: boolean;
      try {
        isValid = VMInstance.eddsa.verify(message, _signature, _publicKey);
      } catch (e) {
        console.log(e);
        return 1;
      }

      if (!isValid) {
        return 1;
      }
    }

    return 0;
  }

  do_curve_hash(input: Region, curve: number, destination: Region): Region {
    let result = this.backend.backend_api.curve_hash(input.data, curve);
    destination.write(result);

    if (this.env) {
      let gasInfo = GasInfo.with_cost(this.env.gasConfig.curve_hash_cost);
      this.env.process_gas_info(gasInfo);
    }

    return new Region(this.exports.memory, 0);
  }

  do_keccak_256(input: Region, destination: Region): Region {
    let result = this.backend.backend_api.keccak_256(input.data);
    destination.write(result);

    if (this.env) {
      let gasInfo = GasInfo.with_cost(this.env.gasConfig.keccak_256_cost);
      this.env.process_gas_info(gasInfo);
    }

    return new Region(this.exports.memory, 0);
  }

  do_sha256(input: Region, destination: Region): Region {
    let result = this.backend.backend_api.sha256(input.data);
    destination.write(result);

    if (this.env) {
      let gasInfo = GasInfo.with_cost(this.env.gasConfig.sha256_cost);
      this.env.process_gas_info(gasInfo);
    }

    return new Region(this.exports.memory, 0);
  }

  do_poseidon_hash(
    left_input: Region,
    right_input: Region,
    curve: number,
    destination: Region
  ): Region {
    let result = this.backend.backend_api.poseidon_hash(
      left_input.data,
      right_input.data,
      curve
    );
    destination.write(result);

    if (this.env) {
      let gasInfo = GasInfo.with_cost(this.env.gasConfig.poseidon_hash_cost);
      this.env.process_gas_info(gasInfo);
    }

    return new Region(this.exports.memory, 0);
  }

  do_groth16_verify(
    input: Region,
    proof: Region,
    vk: Region,
    curve: number
  ): number {
    const isValidProof = this.backend.backend_api.groth16_verify(
      input.data,
      proof.data,
      vk.data,
      curve
    );

    if (this.env) {
      let gasInfo = GasInfo.with_cost(this.env.gasConfig.groth16_verify_cost);
      this.env.process_gas_info(gasInfo);
    }

    if (isValidProof) {
      return 0;
    } else {
      return 1;
    }
  }

  do_debug(message: Region) {
    this.debugMsgs.push(message.read_str());
  }

  do_query_chain(request: Region): Region {
    const resultPtr = this.backend.querier.query_raw(
      request.data,
      this.remainingGas
    );
    // auto update gas on this vm if use contract sharing
    let region = this.allocate(resultPtr.length);
    region.write(resultPtr);
    return region;
  }

  do_abort(message: Region) {
    throw new Error(`abort: ${message.read_str()}`);
  }

  // entrypoints
  public instantiate(env: Env, info: MessageInfo, msg: object): object {
    let instantiate = this.exports[this.version === 4 ? 'init' : 'instantiate'];
    let envArg = this.version === 4 ? getOldEnv(env) : env;
    let infoArg = this.version === 4 ? getOldInfo(info) : info;
    let args = [envArg, infoArg, msg].map((x) => this.allocate_json(x).ptr);
    this.storageReadonly = false;
    let result = instantiate(...args);
    let { json } = this.region(result);
    if (this.version < 6) {
      return getNewResponse(json);
    }
    return json;
  }

  public execute(env: Env, info: MessageInfo, msg: object): object {
    let execute = this.exports[this.version === 4 ? 'handle' : 'execute'];
    let envArg = this.version === 4 ? getOldEnv(env) : env;
    let infoArg = this.version === 4 ? getOldInfo(info) : info;
    let args = [envArg, infoArg, msg].map((x) => this.allocate_json(x).ptr);
    this.storageReadonly = false;
    let result = execute(...args);
    let { json } = this.region(result);
    if (this.version < 6) {
      return getNewResponse(json);
    }
    return json;
  }

  public query(env: Env, msg: object): object {
    let { query } = this.exports;
    let envArg = this.version === 4 ? getOldEnv(env) : env;
    let args = [envArg, msg].map((x) => this.allocate_json(x).ptr);
    this.storageReadonly = true;
    let result = query(...args);
    return this.region(result).json;
  }

  public migrate(env: Env, msg: object): object {
    let { migrate } = this.exports;
    let envArg = this.version === 4 ? getOldEnv(env) : env;
    let args = [envArg, msg].map((x) => this.allocate_json(x).ptr);
    if (this.version === 4) {
      const infoArg: OldMessageInfo = {
        sender: '',
        sent_funds: [],
      };
      args.splice(1, 0, this.allocate_json(infoArg).ptr);
    }
    this.storageReadonly = false;
    let result = migrate(...args);
    let { json } = this.region(result);
    if (this.version < 6) {
      return getNewResponse(json);
    }
    return json;
  }

  public reply(env: Env, msg: object): object {
    let { reply } = this.exports;
    let args = [env, msg].map((x) => this.allocate_json(x).ptr);
    this.storageReadonly = false;
    let result = reply(...args);
    return this.region(result).json;
  }

  // IBC implementation
  public ibc_channel_open(env: Env, msg: object): object {
    let { ibc_channel_open } = this.exports;
    let args = [env, msg].map((x) => this.allocate_json(x).ptr);
    this.storageReadonly = false;
    let result = ibc_channel_open(...args);
    return this.region(result).json;
  }

  public ibc_channel_connect(env: Env, msg: object): object {
    let { ibc_channel_connect } = this.exports;
    let args = [env, msg].map((x) => this.allocate_json(x).ptr);
    this.storageReadonly = false;
    let result = ibc_channel_connect(...args);
    return this.region(result).json;
  }

  public ibc_channel_close(env: Env, msg: object): object {
    let { ibc_channel_close } = this.exports;
    let args = [env, msg].map((x) => this.allocate_json(x).ptr);
    this.storageReadonly = false;
    let result = ibc_channel_close(...args);
    return this.region(result).json;
  }

  public ibc_packet_receive(env: Env, msg: object): object {
    let { ibc_packet_receive } = this.exports;
    let args = [env, msg].map((x) => this.allocate_json(x).ptr);
    this.storageReadonly = false;
    let result = ibc_packet_receive(...args);
    return this.region(result).json;
  }

  public ibc_packet_ack(env: Env, msg: object): object {
    let { ibc_packet_ack } = this.exports;
    let args = [env, msg].map((x) => this.allocate_json(x).ptr);
    this.storageReadonly = false;
    let result = ibc_packet_ack(...args);
    return this.region(result).json;
  }

  public ibc_packet_timeout(env: Env, msg: object): object {
    let { ibc_packet_timeout } = this.exports;
    let args = [env, msg].map((x) => this.allocate_json(x).ptr);
    this.storageReadonly = false;
    let result = ibc_packet_timeout(...args);
    return this.region(result).json;
  }
}

function decodeSections(
  data: Uint8Array | number[]
): (number[] | Uint8Array)[] {
  let result: (number[] | Uint8Array)[] = [];
  let remainingLen = data.length;

  while (remainingLen >= 4) {
    const tailLen = toNumber([
      data[remainingLen - 4],
      data[remainingLen - 3],
      data[remainingLen - 2],
      data[remainingLen - 1],
    ]);

    const section = data.slice(remainingLen - 4 - tailLen, remainingLen - 4);
    result.push(section);

    remainingLen -= 4 + tailLen;
  }

  result.reverse();
  return result;
}
