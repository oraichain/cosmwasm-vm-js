/**
 * Compares two byte arrays using the same logic as strcmp()
 *
 * @returns {number} bytes1 < bytes2 --> -1; bytes1 == bytes2 --> 0; bytes1 > bytes2 --> 1
 */
export function compare(bytes1: Uint8Array, bytes2: Uint8Array): number {
  const length = Math.max(bytes1.length, bytes2.length);
  for (let i = 0; i < length; i++) {
    if (bytes1.length < i) return -1;
    if (bytes2.length < i) return 1;

    if (bytes1[i] < bytes2[i]) return -1;
    if (bytes1[i] > bytes2[i]) return 1;
  }

  return 0;
}

export function toNumber(bigEndianByteArray: Uint8Array | number[]) {
  let value = 0;
  for (const num of bigEndianByteArray) {
    value = (value << 8) | num;
  }
  return value;
}

export function toByteArray(
  number: number,
  fixedLength: number = 4,
  offset: number = 0
) {
  if (number === 0) return new Uint8Array(fixedLength ?? 1);
  // log2(1) == 0, ceil(0) = 0
  const byteLength = fixedLength ?? (Math.ceil(Math.log2(number) / 8) || 1);
  const bytes = new Uint8Array(byteLength);
  let ind = byteLength - offset;
  while (number > 0) {
    bytes[--ind] = number & 0b11111111;
    number >>= 8;
  }
  return bytes;
}
