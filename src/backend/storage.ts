import { fromBase64, toBase64 } from '@cosmjs/encoding';
import { compare, toByteArray, toNumber } from '../helpers/byte-array';
import Immutable from 'immutable';
import { AbstractSortedSet, Options } from '../sortedset';
import { BinaryTreeIterator } from 'sortedset/BinaryTreeIterator';

export interface IStorage {
  dict: Immutable.Map<string, string>;
  get(key: Uint8Array): Uint8Array | null;

  set(key: Uint8Array, value: Uint8Array): void;

  remove(key: Uint8Array): void;

  keys(): Iterable<Uint8Array>;
}

export class Record {
  public key = Uint8Array.from([]);
  public value = Uint8Array.from([]);
}

export interface Iter {
  data: Array<Record>;
  position: number;
}

export enum Order {
  Ascending = 1,
  Descending = 2,
}

export interface IIterStorage extends IStorage {
  all(iterator_id: Uint8Array): Array<Record>;

  scan(
    start: Uint8Array | null,
    end: Uint8Array | null,
    order: Order
  ): Uint8Array;
  next(iterator_id: Uint8Array): Record | null;
}

export class BasicKVStorage implements IStorage {
  // TODO: Add binary uint / typed Addr maps for cw-storage-plus compatibility
  constructor(public dict: Immutable.Map<string, string> = Immutable.Map()) {}

  *keys() {
    for (const key of this.dict.keys()) {
      yield fromBase64(key);
    }
  }

  get(key: Uint8Array): Uint8Array | null {
    const keyStr = toBase64(key);
    const value = this.dict.get(keyStr);
    if (value === undefined) {
      return null;
    }

    return fromBase64(value);
  }

  set(key: Uint8Array, value: Uint8Array): void {
    const keyStr = toBase64(key);
    this.dict = this.dict.set(keyStr, toBase64(value));
  }

  remove(key: Uint8Array): void {
    this.dict = this.dict.remove(toBase64(key));
  }
}

export class BasicKVIterStorage extends BasicKVStorage implements IIterStorage {
  constructor(
    public dict: Immutable.Map<string, string> = Immutable.Map(),
    public iterators: Map<number, Iter> = new Map()
  ) {
    super(dict);
  }

  all(iterator_id: Uint8Array): Array<Record> {
    const out: Array<Record> = [];

    while (true) {
      const record = this.next(iterator_id);
      if (record === null) {
        break;
      }
      out.push(record);
    }
    return out;
  }

  // Get next element of iterator with ID `iterator_id`.
  // Creates a region containing both key and value and returns its address.
  // Ownership of the result region is transferred to the contract.
  // The KV region uses the format value || valuelen || key || keylen, where valuelen and keylen are fixed-size big-endian u32 values.
  // An empty key (i.e. KV region ends with \0\0\0\0) means no more element, no matter what the value is.
  next(iterator_id: Uint8Array): Record | null {
    const iter = this.iterators.get(toNumber(iterator_id));
    if (iter === undefined) {
      throw new Error(`Iterator not found.`);
    }
    const record = iter.data[iter.position];
    if (!record) {
      return null;
    }

    iter.position += 1;
    return record;
  }

  scan(
    start: Uint8Array | null,
    end: Uint8Array | null,
    order: Order
  ): Uint8Array {
    if (!(order in Order)) {
      throw new Error(`Invalid order value ${order}.`);
    }
    const hasStart = start?.length;
    const hasEnd = end?.length;

    // if there is end namespace
    const filterKeyLength = hasEnd && end[0] == 0 ? end[1] : 0;

    const newId = this.iterators.size + 1;

    // if start > end, this represents an empty range
    if (hasStart && hasEnd && compare(start, end) === 1) {
      this.iterators.set(newId, { data: [], position: 0 });
      return toByteArray(newId);
    }

    let data: Record[] = [];
    for (const key of this.dict.keys()) {
      let keyArr = fromBase64(key);

      // out of range
      if (
        (hasStart && compare(keyArr, start) < 0) ||
        (hasEnd && compare(keyArr, end) >= 0)
      )
        continue;

      // different namespace
      if (filterKeyLength && keyArr[0] === 0 && filterKeyLength != keyArr[1]) {
        continue;
      }

      data.push({ key: keyArr, value: this.get(keyArr)! });
    }

    data.sort((a, b) =>
      order === Order.Descending ? compare(b.key, a.key) : compare(a.key, b.key)
    );

    this.iterators.set(newId, { data, position: 0 });
    return toByteArray(newId);
  }
}

export const SortedSetOption: Options = {
  onInsertConflict: (_, value) => {
    return value;
  },
  comparator: ([a], [b]) => {
    return compare(a, b);
  },
};

export class SortedKVStorage implements IStorage {
  get dict(): Immutable.Map<string, string> {
    return Immutable.Map(
      this.sortedSet.toArray().map(([k, v]) => [toBase64(k), toBase64(v)])
    );
  }

  constructor(
    public sortedSet: AbstractSortedSet = new AbstractSortedSet(SortedSetOption)
  ) {}

  *keys() {
    for (const entry of this.sortedSet.toArray()) {
      yield entry[0];
    }
  }

  get(key: Uint8Array): Uint8Array | null {
    const result = this.sortedSet.findIterator([key]).value();
    if (result === null || compare(result[0], key) !== 0) {
      return null;
    }
    return result[1];
  }

  // clone value
  set(key: Uint8Array, value: Uint8Array): void {
    this.sortedSet.insert([new Uint8Array(key), new Uint8Array(value)]);
  }

  remove(key: Uint8Array): void {
    try {
      this.sortedSet.remove([key]);
    } catch {}
  }
}

export class SortedKVIterStorage
  extends SortedKVStorage
  implements IIterStorage
{
  constructor(
    dict?: Immutable.Map<string, string>,
    public iterators: Map<number, Iter> = new Map()
  ) {
    let sortedSet: AbstractSortedSet | undefined = undefined;
    if (dict) {
      sortedSet = new AbstractSortedSet(SortedSetOption);
      for (const [k, v] of dict) {
        sortedSet.insert([fromBase64(k), fromBase64(v)]);
      }
    }
    super(sortedSet);
  }

  all(iterator_id: Uint8Array): Array<Record> {
    const out: Array<Record> = [];

    while (true) {
      const record = this.next(iterator_id);
      if (record === null) {
        break;
      }
      out.push(record);
    }
    return out;
  }

  // Get next element of iterator with ID `iterator_id`.
  // Creates a region containing both key and value and returns its address.
  // Ownership of the result region is transferred to the contract.
  // The KV region uses the format value || valuelen || key || keylen, where valuelen and keylen are fixed-size big-endian u32 values.
  // An empty key (i.e. KV region ends with \0\0\0\0) means no more element, no matter what the value is.
  next(iterator_id: Uint8Array): Record | null {
    const iter = this.iterators.get(toNumber(iterator_id));
    if (iter === undefined) {
      throw new Error(`Iterator not found.`);
    }
    const record = iter.data[iter.position];
    if (!record) {
      return null;
    }

    iter.position += 1;
    return record;
  }

  scan(
    start: Uint8Array | null,
    end: Uint8Array | null,
    order: Order
  ): Uint8Array {
    if (!(order in Order)) {
      throw new Error(`Invalid order value ${order}.`);
    }
    const hasStart = start !== null && start.length;
    const hasEnd = end !== null && end.length;

    // if there is end namespace
    const filterKeyLength = hasEnd && end[0] == 0 ? end[1] : 0;

    const newId = this.iterators.size + 1;

    // if start > end, this represents an empty range
    if (hasStart && hasEnd && compare(start, end) === 1) {
      this.iterators.set(newId, { data: [], position: 0 });
      return toByteArray(newId);
    }

    let data: Record[] = [];

    let beginIter: BinaryTreeIterator | null = start
      ? this.sortedSet.findIterator([start])
      : this.sortedSet.beginIterator();
    let endIter = end
      ? this.sortedSet.findIterator([end]).previous()
      : this.sortedSet.endIterator();

    while (beginIter !== null) {
      const entry = beginIter.value();
      if (entry === null) break;
      const [key, value] = entry;

      // different namespace
      if (!filterKeyLength || key[0] !== 0 || filterKeyLength === key[1]) {
        data.push({ key, value });
      }

      // end of search
      if (endIter !== null && beginIter.node === endIter.node) break;
      beginIter = beginIter.next();
    }

    if (order === Order.Descending) {
      data.reverse();
    }

    this.iterators.set(newId, { data, position: 0 });
    return toByteArray(newId);
  }
}
