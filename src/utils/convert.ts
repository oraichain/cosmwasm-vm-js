export function arrayToNumber(array: Uint8Array) {
  var length = array.length;

  let buffer = Buffer.from(array);
  var result = buffer.readUIntBE(0, length);

  return result;
}
