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

async function testVersion(version = '0.13') {
  const vm = new VMInstance({
    backend_api: new BasicBackendApi('orai'),
    storage: new BasicKVIterStorage(),
    querier: new BasicQuerier(),
  });
  await vm.build(readFileSync(`testdata/v${version}/oraichain_nft.wasm`));
  const instantiateRes = vm.instantiate(mockEnv, mockInfo, {
    name: 'name',
    version: 'version',
    symbol: 'symbol',
    minter: 'orai122qgjdfjm73guxjq0y67ng8jgex4w09ttguavj',
  });

  expect('ok' in instantiateRes).toBeTruthy();

  let executeRes = vm.execute(mockEnv, mockInfo, {
    mint: {
      token_id: 'token_id',
      owner: 'orai122qgjdfjm73guxjq0y67ng8jgex4w09ttguavj',
      name: 'name',
      description: 'description',
      image: 'image',
    },
  });

  console.log(executeRes);

  executeRes = vm.execute(mockEnv, mockInfo, {
    send_nft: {
      contract: 'orai122qgjdfjm73guxjq0y67ng8jgex4w09ttguavj',
      token_id: 'token_id',
    },
  });

  console.log(executeRes);

  const queryRes = vm.query(mockEnv, {
    all_tokens: {},
  });

  const data = (queryRes as { ok: string }).ok;

  console.log(JSON.parse(fromAscii(fromBase64(data))));
}

describe('Old CosmWasmVM', () => {
  it('version 0.13', async () => {
    await testVersion('0.13');
  });

  it('version 0.14', async () => {
    await testVersion('0.14');
  });
});
