import { BigNumber } from "ethers"

export class HEXer {
  private hex: string

  constructor() {this.hex = ''}

  toString() { return this.hex}
  toString0x() { return '0x' + this.hex}

  uint8(data: number): HEXer {
    if (data > 255 || data < 0 || data !== Math.round(data)) {
      throw new Error("Wrong uint8: " + data)
    }
    this.hex += data.toString(16).padStart(2, '0')

    return this
  }

  bool(data: boolean): HEXer {
    return this.uint8(data ? 1:0)
  }

  uint16(data: number): HEXer {
    if (data >= 256*256 || data < 0 || data !== Math.round(data)) {
      throw new Error("Wrong uint16: " + data)
    }
    this.hex += data.toString(16).padStart(4, '0')

    return this
  }

  uint32(data: number): HEXer {
    if (data >= 256*256*256*256 || data < 0 || data !== Math.round(data)) {
      throw new Error("Wrong uint32: " + data)
    }
    this.hex += data.toString(16).padStart(8, '0')

    return this
  }

  uint256(data: BigNumber): HEXer {
    const hex = data.toHexString().slice(2).padStart(64, '0')
    if (data.lt(0) || hex.length > 64) {
      throw new Error("Wrong uin256: " + data.toString())
    }
    this.hex += hex

    return this
  }

  uint(data: BigNumber): HEXer {
    return this.uint256(data)
  }

  address(addr: string): HEXer {
    if (addr.length > 42) {
      throw new Error("Wrong address: " + addr)
    }
    // 0xabcd => 0000abcd
    this.hex += addr.slice(2).padStart(40, '0')

    return this
  }

  hexData(data: string): HEXer {
    if (data.length % 2 != 0) {
      throw new Error("Wrong hex data length: " + data.length)
    }

    if (data.startsWith('0x')) data = data.slice(2)
    this.hex += data

    return this
  }
}