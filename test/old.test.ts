import { readFileSync } from 'fs';
import { fromAscii, fromBase64, toAscii } from '@cosmjs/encoding';
import { Env, MessageInfo } from '../src/types';
import { Environment, VMInstance } from '../src';

import {
  BasicBackendApi,
  BasicKVIterStorage,
  BasicQuerier,
  IBackend,
  Order,
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

  vm.execute(mockEnv, mockInfo, {
    mint: {
      token_id: 'token_id1',
      owner: 'orai122qgjdfjm73guxjq0y67ng8jgex4w09ttguavj',
      name: 'name1',
      description: 'description1',
      image: 'image1',
    },
  });

  vm.execute(mockEnv, mockInfo, {
    mint: {
      token_id: 'token_id2',
      owner: 'orai122qgjdfjm73guxjq0y67ng8jgex4w09ttguavj',
      name: 'name2',
      description: 'description2',
      image: 'image2',
    },
  });

  let queryRes = vm.query(mockEnv, { all_tokens: {} }) as { ok: any };
  console.log(JSON.parse(fromAscii(fromBase64(queryRes.ok))));

  queryRes = vm.query(mockEnv, {
    tokens: { owner: 'orai122qgjdfjm73guxjq0y67ng8jgex4w09ttguavj' },
  }) as { ok: any };

  expect(JSON.parse(fromAscii(fromBase64(queryRes.ok)))).toEqual({
    tokens: ['token_id1', 'token_id2'],
  });
}

describe('Old CosmWasmVM', () => {
  it('test storage', () => {
    const vm = new VMInstance({
      backend_api: new BasicBackendApi('orai'),
      storage: new BasicKVIterStorage(),
      querier: new BasicQuerier(),
    });
    // Arrange
    // TODO: VM instance w/ coin data & Bank module
    // const vm = new VMInstance(backend, [{ denom: 'gold', amount: '123456' }]);
    const storage = vm.backend.storage;

    storage.set(
      toAscii('tokens__ownerorai1ur2vsjrjarygawpdwtqteaazfchvw4fg6uql76'),
      toAscii(`1`)
    );
    storage.set(
      toAscii('tokens__ownerorai14n3tx8s5ftzhlxvq0w5962v60vd82h30rha573'),
      toAscii(`1`)
    );
    storage.set(
      toAscii('tokenstoken_id1'),
      toAscii(
        `{"token_id": "token_id1", "owner": "owner1", "name": "name1", "description": "description1", "image": "image1"}`
      )
    );
    storage.set(
      toAscii('tokenstoken_id2'),
      toAscii(
        `{"token_id": "token_id2", "owner": "owner2", "name": "name2", "description": "description2", "image": "image2"}`
      )
    );

    let iterId = storage.scan(
      toAscii('tokens'),
      toAscii('tokent'),
      Order.Ascending
    );
    let cnt = storage.all(iterId);
    console.log(cnt.map((a) => fromAscii(a.value)));
  });

  it('version 0.13', async () => {
    await testVersion('0.13');
  });

  it('version 0.14', async () => {
    await testVersion('0.14');
  });

  it('migrate 0.13', async () => {
    const backend_api = new BasicBackendApi('orai');
    const env = new Environment(backend_api);
    const vm = new VMInstance(
      {
        backend_api,
        storage: new BasicKVIterStorage(),
        querier: new BasicQuerier(),
      },
      env
    );

    await vm.build(readFileSync(`testdata/v0.13/oraichain_nft.wasm`));
    const currentGasUsed = vm.gasUsed;
    const instantiateRes = vm.instantiate(mockEnv, mockInfo, {
      name: 'name',
      version: 'version',
      symbol: 'symbol',
      minter: 'orai122qgjdfjm73guxjq0y67ng8jgex4w09ttguavj',
    });
    console.log('gasUsed', vm.gasUsed - currentGasUsed);
    expect('ok' in instantiateRes).toBeTruthy();

    vm.execute(mockEnv, mockInfo, {
      mint: {
        token_id: 'token_id1',
        owner: 'orai122qgjdfjm73guxjq0y67ng8jgex4w09ttguavj',
        name: 'name1',
        description: 'description1',
        image: 'image1',
      },
    });

    let queryRes = vm.query(mockEnv, { contract_info: {} }) as { ok: any };
    expect(JSON.parse(fromAscii(fromBase64(queryRes.ok)))).toEqual({
      name: 'name',
      symbol: 'symbol',
      version: 'version',
    });

    // now try to migrate
    await vm.build(readFileSync(`testdata/v0.13/oraichain_nft_v2.wasm`));
    vm.migrate(mockEnv, { test_field: 'abc' });

    queryRes = vm.query(mockEnv, { contract_info: {} }) as { ok: any };
    expect(JSON.parse(fromAscii(fromBase64(queryRes.ok)))).toEqual({
      name: 'name',
      symbol: 'symbol',
      version: 'abc',
    });
  });
});
