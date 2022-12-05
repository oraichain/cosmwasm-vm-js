import { readFileSync } from 'fs';
import { fromAscii, fromBase64 } from '@cosmjs/encoding';
import { Env, MessageInfo } from '../src/types';
import { VMInstance } from '../src/instance';
import {
  BasicBackendApi,
  BasicKVIterStorage,
  BasicQuerier,
  IBackend,
} from '../src/backend';

const wasmBytecode = readFileSync('testdata/v1.1/mixer.wasm');
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
  sender: 'orai1602dkqjvh4s7ryajnz2uwhr8vetrwr8nekpxv5',
  funds: [],
};

const commitments = [
  'b3e69f62cd2d005159b118e277d67bb5c8c9bca63de1706382fab7cd4d8c5810',
  '84d6bdcfd953993012f08970d9c9b472d96114b4edc69481968cafc07877381c',
  'c42b1debfbf3b5780b47c1d916e50d3be79206a0193eeedc6fd113da43b5602f',
  '963698dc35e0f94260457c79e787a0913a5c6d6eae006e26858487f298d24506',
  'bc2f0462e40b293bfc001c4ad93750a28efb415335b114a51bfcec39c2721d2c',
  '1a5ea11e2c7941e8e9a1fa8a0c4448f4de84f8eb212d5432556fa9080fb3372e',
  'bdc6da7ddc73454b1982000a2a09b46b83b948c940fb54525405f3af21564208',
  '32675db4b571996ded057b499202175b37dc2956db9f26deca7a54921f23d913',
  'bd2880842bf0a104aa380521a007417bd13c1d8c89a6b841dcc78f8f2b4ebd11',
  '92dff66a248c9d42b517ef7e03b9fe6b57c10b1ead1ff9bbec9360791a85bf05',
];

const proof =
  '5a8a562699b97b61764a42b9f3f94035ec78f46216338e0a1bc2b046dd10fa24e3c6be39639d0550b872efb8d4a68af043bcbb00458e333ab9b9a182d5273c2069f43ee68a5b4111805498b930f9a68087a50218568051bd126713c977ed1ea7160c6490d2a3c87137ff51faca843b9c0add32f0c03eab270ee4c0b75c66880c';
const root = 'fecf3ca3b3f7fa371e0ca433f5d3cc66cac04075e05311d0d95ad423b59e0515';
const nullifier =
  'fddf254539fd45c577e62c0c93d486e5dc8337c1a2fb92d9e25865718cdc641a';

describe('CosmWasmVM', () => {
  it('full-flow', async () => {
    await vm.build(wasmBytecode);
    const instantiateRes = vm.instantiate(mockEnv, mockInfo, {
      deposit_size: '1000000',
      merkletree_levels: 30,
      native_token_denom: 'orai',
    });
    console.log(instantiateRes.json);

    for (const commitment of commitments) {
      let info: MessageInfo = {
        ...mockInfo,
        funds: [{ denom: 'orai', amount: '1000000' }],
      };
      const executeRes = vm.execute(mockEnv, info, {
        deposit: {
          commitment: Buffer.from(commitment, 'hex').toString('base64'),
        },
      });
      console.log(executeRes.json);
    }

    // Proof
    const executeRes = vm.execute(mockEnv, mockInfo, {
      withdraw: {
        proof_bytes: Buffer.from(proof, 'hex').toString('base64'),
        root: Buffer.from(root, 'hex').toString('base64'),
        nullifier_hash: Buffer.from(nullifier, 'hex').toString('base64'),
        recipient: 'orai1602dkqjvh4s7ryajnz2uwhr8vetrwr8nekpxv5',
        relayer: 'orai16f3pj4fkh7v49797ja7qc5n9j2r3m6h4h60l26',
        fee: '0',
        refund: '0',
      },
    });
    console.log(JSON.stringify(executeRes.json));

    const queryRes = vm.query(mockEnv, {
      merkle_tree_info: {},
    });
    const data = (queryRes.json as { ok: string }).ok;

    console.log(JSON.parse(fromAscii(fromBase64(data))));
  });
});
