import { ConstantProductRPool, MultiRoute, RouteLeg } from "@sushiswap/tines";
import { HEXer } from "../HEXer";
import { PoolCode } from "./PoolCode";

export class ConstantProductPoolCode extends PoolCode {
  constructor(pool: ConstantProductRPool, provederName: string) {
    super(pool, provederName)
  }

  getSwapCodeForRouteProcessor(leg: RouteLeg, route: MultiRoute, to: string): string {
    // swapUniswapPool = 0x20(address pool, address tokenIn, bool direction, address to)
    const code = new HEXer()
      .uint8(10).address(this.pool.address)
      .address(leg.tokenFrom.address).bool(leg.tokenFrom.address == this.pool.token0.address)
      .address(to).toString()
    console.assert(code.length == 62*2, "getSwapCodeForRouteProcessor unexpected code length")
    return code
  }
}