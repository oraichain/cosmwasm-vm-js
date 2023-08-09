// @ts-nocheck

import { fromBase64, toAscii } from '@cosmjs/encoding';
import { toByteArray, toNumber } from '../helpers/byte-array';
import { BasicKVIterStorage, SortedKVIterStorage, Order } from './storage';

let store = new BasicKVIterStorage();
let fastStore = new SortedKVIterStorage();
for (let i = 0; i < 10000; ++i)
  store.set(toByteArray(i, 4), toAscii(i.toString()));
for (let i = 0; i < 10000; ++i)
  fastStore.set(toByteArray(i, 4), toAscii(i.toString()));

let start = toByteArray(100, 4);
let stop = toByteArray(110, 4);

console.time('BasicKVIterStorage');
for (let i = 0; i < 100; ++i)
  store.all(store.scan(start, stop, Order.Descending));
console.timeLog(
  'BasicKVIterStorage',
  store
    .all(store.scan(start, stop, Order.Descending))
    .map((record) => [
      toNumber(record.key),
      Buffer.from(record.value).toString(),
    ])
);

console.time('SortedKVIterStorage');
for (let i = 0; i < 100; ++i)
  fastStore.all(fastStore.scan(start, stop, Order.Descending));
console.timeLog(
  'SortedKVIterStorage',
  fastStore
    .all(fastStore.scan(start, stop, Order.Descending))
    .map((record) => [
      toNumber(record.key),
      Buffer.from(record.value).toString(),
    ])
);
