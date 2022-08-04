import { readFileSync } from 'fs';
import { CosmWasmVM } from '../src';
import { bech32 } from 'bech32';
import { toBase64 } from '@cosmjs/encoding';

const wasm_byte_code = readFileSync('./cosmwasm_vm_test.wasm');
const vm = new CosmWasmVM();

const mock_env = {
  block: {
    height: 1337,
    time: '2000000000',
    chain_id: 'columbus-5',
  },
  contract: {
    address: 'terra14z56l0fp2lsf86zy3hty2z47ezkhnthtr9yq76',
  },
};

const mock_info = {
  sender: 'terra1337xewwfv3jdjuz8e0nea9vd8dpugc0k2dcyt3',
  funds: [],
};

describe('CosmWasmVM', () => {
  it('instantiates', async () => {
    await vm.build(wasm_byte_code);

    const chain = vm.instantiate(mock_env, mock_info, { count: 20 });
    console.log(chain.json);
    console.log(vm.store);
    const actual = {
      ok: {
        attributes: [
          { key: 'method', value: 'instantiate' },
          {
            key: 'owner',
            value: 'terra1337xewwfv3jdjuz8e0nea9vd8dpugc0k2dcyt3',
          },
          { key: 'count', value: '20' },
        ],
        data: null,
        events: [],
        messages: [],
      },
    };
    expect(chain.json).toEqual(actual);
    expect(vm.store.size).toEqual(2);
  });

  it('execute', async () => {
    await vm.build(wasm_byte_code);

    let chain = vm.instantiate(mock_env, mock_info, { count: 20 });
    chain = vm.execute(mock_env, mock_info, { increment: {} });
    console.log(chain.json);
    console.log(vm.store);
    const expected = {
      ok: {
        attributes: [{ key: 'method', value: 'try_increment' }],
        data: null,
        events: [],
        messages: [],
      },
    };
    expect(chain.json).toEqual(expected);
    expect(vm.store.size).toEqual(2);
  });

  it('do_db_read should read a valid key', () => {
    const key = toBase64(new Uint8Array([1, 2, 3, 4, 5]));
    const value = '1234567890abcdef1234567890abcdef1234567890abcdef';
    vm.store.set(key, value);
    const result = vm.db_read(vm.allocate_b64(key).ptr);
    expect(result).not.toEqual(null);
  });

  it('db_write should write key and value', () => {
    const key = toBase64(new Uint8Array([1, 2, 3, 4, 5]));
    const value = '1234567890abcdef1234567890abcdef1234567890abcdef';
    vm.db_write(vm.allocate_b64(key).ptr, vm.allocate_str(value).ptr);
    const allocatePtr = vm.allocate_b64(key).ptr;
    expect(allocatePtr).toEqual(vm.region(allocatePtr).ptr);
  });

  it('abort', () => {
    try {
      vm.abort(4, 8, 16, 32);
    } catch (e) {
      expect(e).toEqual(new Error('abort:  at :16:32'));
    }
  });

  it('addr_canonicalize', () => {
    const cosmosAddr = bech32.encode(
      'cosmos1',
      bech32.toWords(
        Buffer.from('1234567890abcdef1234567890abcdef12345678', 'hex')
      )
    );
    const region = vm.allocate_str(cosmosAddr);
    const number = vm.addr_canonicalize(
      region.ptr,
      vm.allocate_json({
        address: cosmosAddr,
      }).ptr
    );
    console.log(number);
    console.log(vm.store);
    expect(number).toEqual(0);
  });

  it('addr_humanize', () => {
    const cosmosAddr = bech32.encode(
      'cosmos1',
      bech32.toWords(
        Buffer.from('1234567890abcdef1234567890abcdef12345678', 'hex')
      )
    );
    const region = vm.allocate_str(cosmosAddr);
    const number = vm.addr_humanize(
      region.ptr,
      vm.allocate_json({
        address: cosmosAddr,
      }).ptr
    );
    console.log(number);
    console.log(vm.store);
    expect(number).toEqual(0);
  });

  it('should addr_validate valid address', () => {
    const cosmosAddr = bech32.encode(
      'cosmos1',
      bech32.toWords(
        Buffer.from('1234567890abcdef1234567890abcdef12345678', 'hex')
      )
    );
    const region = vm.allocate_str(cosmosAddr);
    const number = vm.addr_validate(region.ptr);
    console.log(number);
    console.log(vm.store);
    expect(number).toEqual(0);
  });

  it('addr_validate should throw error for invalid address', () => {
    try {
      const region = vm.allocate_str(
        'cosmos11zg69v7ys40x77y352eufp27daufrg4nchuhe2ng'
      );
      vm.addr_validate(region.ptr);
    } catch (e) {
      expect(e).toEqual(
        new Error(
          'Invalid checksum for cosmos11zg69v7ys40x77y352eufp27daufrg4nchuhe2ng'
        )
      );
    }
  });

  it('addr_validate should throws error for too long address', () => {
    try {
      const region = vm.allocate_str(
        'cosmos11zg69v7ys40x77y352eufp27daufrg4nchuhe2ngdafsadfsafasdfasfasfsadfsadfsafsafdasfsadfsadf'
      );
      vm.addr_validate(region.ptr);
    } catch (e) {
      expect(e).toEqual(new Error('Exceeds length limit'));
    }
  });

  it('addr_validate should throws error for empty address', () => {
    try {
      const region = vm.allocate_str('');
      vm.addr_validate(region.ptr);
    } catch (e) {
      expect(e).toEqual(new Error('Empty address.'));
    }
  });
});
