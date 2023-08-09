// @ts-nocheck

import { toAscii } from '@cosmjs/encoding';
import { toByteArray, toNumber } from '../helpers/byte-array';
import { BasicKVIterStorage, SortedKVIterStorage, Order } from './storage';

let store = new BasicKVIterStorage();
let fastStore = new SortedKVIterStorage();
console.time('BasicKVIterStorage Insert');
for (let i = 0; i < 1000000; ++i)
  store.set(toByteArray(i, 4), toAscii(i.toString()));
console.timeEnd('BasicKVIterStorage Insert');
console.time('SortedKVIterStorage Insert');
for (let i = 0; i < 1000000; ++i)
  fastStore.set(toByteArray(i, 4), toAscii(i.toString()));
console.timeEnd('SortedKVIterStorage Insert');

let start = toByteArray(500000, 4);
let stop = toByteArray(500005, 4);

let ret;
console.time('BasicKVIterStorage Scan');
ret = store.all(store.scan(start, stop, Order.Ascending));
console.timeEnd('BasicKVIterStorage Scan');
console.log(
  ret.map((record) => [
    toNumber(record.key),
    Buffer.from(record.value).toString(),
  ])
);

console.time('SortedKVIterStorage Scan');
ret = fastStore.all(fastStore.scan(start, stop, Order.Ascending));
console.timeEnd('SortedKVIterStorage Scan');
console.log(
  ret.map((record) => [
    toNumber(record.key),
    Buffer.from(record.value).toString(),
  ])
);
