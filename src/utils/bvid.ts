const XOR_CODE = BigInt('23442827791579')
const MAX_AID = BigInt(1) << BigInt(51)
const BASE = BigInt(58)
const ALPHABET = 'FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf'

export function av2bv(aid: number | string | bigint): string {
  const bytes = ['B', 'V', '1', '0', '0', '0', '0', '0', '0', '0', '0', '0']
  let index = bytes.length - 1
  let value = (MAX_AID | BigInt(aid)) ^ XOR_CODE
  while (value > 0) {
    bytes[index] = ALPHABET[Number(value % BASE)]
    value = value / BASE
    index--
  }
  ;[bytes[3], bytes[9]] = [bytes[9], bytes[3]]
  ;[bytes[4], bytes[7]] = [bytes[7], bytes[4]]
  return bytes.join('')
}
