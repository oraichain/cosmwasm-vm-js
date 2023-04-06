import { readFileSync } from 'fs';
import { fromAscii, fromBase64 } from '@cosmjs/encoding';
import { Env, MessageInfo } from '../src/types';
import { VMInstance } from '../src';

import {
  BasicBackendApi,
  BasicKVIterStorage,
  BasicQuerier,
  IBackend,
} from '../src/backend';

import { Poseidon, curve_hash, groth16_verify } from 'cosmwasm-vm-js-zk/nodejs';
const poseidon = new Poseidon();
VMInstance.poseidon_hash = poseidon.hash.bind(poseidon);
VMInstance.curve_hash = curve_hash;
VMInstance.groth16_verify = groth16_verify;

const wasmBytecode = readFileSync('testdata/v1.1/zk.wasm');
const backend: IBackend = {
  backend_api: new BasicBackendApi('orai'),
  storage: new BasicKVIterStorage(),
  querier: new BasicQuerier(),
};

const vm = new VMInstance(backend);
const mockEnv: Env = {
  block: {
    height: 1337,
    time: '2000000000',
    chain_id: 'Oraichain',
  },
  contract: {
    address: 'orai1qxd52frq6jnd73nsw49jzp4xccal3g9v47pxwftzqy78ww02p75s62e94t',
  },
};

const mockInfo: MessageInfo = {
  sender: 'orai122qgjdfjm73guxjq0y67ng8jgex4w09ttguavj',
  funds: [],
};

const PUBLIC_INPUTS =
  't6CNWWLx3Fd4+fI4XCkc5vdvmwdeAo5lAPMnIDvrxh9SGQJVQa0SBUqvbA7oxa4J8jtpMGipzID9lg9mbNZRIeD7lRlesjw8ZdffRKet+Dhx7AOAGJ0+dXQXdl1Rrg0q';
const PROOF =
  'Ig2y4hzjpMsVvHC96ppAv68XvyNrigWimFBtG3/ixK62J5Wk3EEMx2j7zwlWFV5KcftnhcaRTTtuqd5fp7SZJZH/uvmMWEdM0GKrmoE/oFoXrvh0eaTlxNjoteRLDQGGkkHa7zjdUgdKBndWTokOBXYaw2xsn/I9g1a5rW2a6y8=';
const VK =
  'qNKepAYpvnYvKhK9p8xFuZijTEOpbExnRMjHqQDo+Ape7Ob6V3FInLAwb0ma2Roz0BWfKXhjMteC24cKCYBECqEiWtI8DkdsfTa3luaptQJAhBtL6VXRPqVN2NoBEo4M+SCUtFn/iCeAq98+F4TAbfbIXAAG/X8ll+PpBS2SFSdPCPxPlNyBKfKaV43Bf16mDqhdLIingpS3ktvy+o0wlzuAymtWdGO2kLizqPcOtkaCJzWOXzFuuBUKkhUrdTUZxMqCf+wX9yg9FSKHZ7Vrc27JSY85/ltRGor1A7Y6GZcEAAAAAAAAALnIa74+XvNJDV20eL4KeTOTTktaFI4sAWArR1yD4lAIkdxEpv4vMx2ptm81YjmKdiZ397fJXTqCqWmODPYhISjW6yej8Rq7UqmKUJvxUC8JR+mrnB1yoIYUDA0xaGbWJMIqafjftZV+NdjT01CzyD7pXoiXx7dtQYgWg9JWHNkZ';

describe('CosmWasmVM', () => {
  it('full-flow', async () => {
    await vm.build(wasmBytecode);
    const instantiateRes = vm.instantiate(mockEnv, mockInfo, {
      curve: 'bn254',
    });
    console.log(instantiateRes);

    const executeRes = vm.execute(mockEnv, mockInfo, {
      set_vk_raw: {
        vk_raw: VK,
      },
    });

    const queryRes = vm.query(mockEnv, {
      verify_proof_json: {
        proof_raw: PROOF,
        public_inputs: PUBLIC_INPUTS,
      },
    });

    const data = (queryRes as { ok: string }).ok;

    console.log(JSON.parse(fromAscii(fromBase64(data))));
  });
});
