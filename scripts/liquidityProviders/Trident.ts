import { ConstantProductRPool, RouteLeg, RPool, RToken } from "@sushiswap/tines";
import {BigNumber, Contract, ethers} from 'ethers'
import { LiquidityProvider, PoolRegistarator } from "./LiquidityProvider";
import { getCreate2Address } from "ethers/lib/utils";
import { keccak256, pack } from '@ethersproject/solidity'
import { HEXer } from "../HEXer";
import { ChainId, Network, Token } from "../networks/Network";
import { ConstantProductPoolFactoryABI } from "../../ABI/ConstantProductPoolFactoryABI";
import { ConstantProductPoolABI } from "../../ABI/ConstantProductPoolABI";
import { Limited } from "../Limited";

const ConstantProductPoolFactory = {
  [ChainId.MATIC]: '0x05689fCfeE31FCe4a67FbC7Cab13E74F80A4E288',
}

function convertTokenToBento(token: Token): RToken {
  const t:RToken = {...token}
  t.name = `Bnt Share(${token.name})`
  delete t.tokenId
  return t
}

function sortTokens(tokens: Token[]): Token[] {
  const t1: [Token, BigNumber][] = tokens.map(t => [t, BigNumber.from(t.address)])
  t1.sort(([, a0], [, a1]) => {
    if (a0.lt(a1)) return -1
    if (a0.eq(a1)) return 0
    return 1
  })
  return t1.map(([t, ]) => t)
}

export class TridentProvider extends LiquidityProvider {
  pools: Map<string, RPool>
  
  constructor(r: PoolRegistarator, chainDataProvider: ethers.providers.BaseProvider, net: Network, l: Limited) {
    super(r, chainDataProvider, net, l)
    this.pools = new Map<string, RPool>()
  }

  getProviderName(): string {return 'Trident'}

  async getPools(t0: Token, t1: Token): Promise<RPool[]> {
    if (ConstantProductPoolFactory[this.network.chainId] === undefined) {
      // No trident for this network
      return []
    }
    const tokens = this._getAllRouteTokens(t0, t1)
    const pools = await this._getAllPools(tokens)
    this.registrator.addPools(pools.map(p => p.address), this)
    pools.forEach(p => this.pools.set(p.address, p))
    return pools
  }

  getSwapCodeForRouteProcessor(leg: RouteLeg, toAddress: string): string {
    return 'Unimplemented'
    // const {poolAddress, tokenFrom} = leg
    // const pool = this.pools.get(poolAddress)
    // if (pool === undefined) {
    //   throw new Error("Unknown pool " + poolAddress)
    // } else {
    //   if (tokenFrom.address !== pool.token0.address && tokenFrom.address !== pool.token1.address) {
    //     throw new Error(`Unknown token ${tokenFrom.address} for the pool ${poolAddress}`)
    //   }
    //   // swapUniswapPool = 0x20(address pool, address tokenIn, bool direction, address to)
    //   const code = new HEXer()
    //     .uint8(20).address(poolAddress)
    //     .address(tokenFrom.address).bool(tokenFrom.address == pool.token0.address)
    //     .address(toAddress).toString()
    //   console.assert(code.length == 62*2, "Sushi.getSwapCodeForRouteProcessor unexpected code length")
    //   return code
    // }
  }

  async _getTokenPairPools(
    t0: Token, t1: Token, factory: Contract
  ): Promise<RPool[]> {
    const pools:RPool[] = []
    const pairPoolsCount = await this.limited.call(
      () => factory.poolsCount(t0.address, t1.address)
    )
    if (pairPoolsCount == 0) return []
    const pairPools: string[] = await this.limited.call(
      () => factory.getPools(t0.address, t1.address, 0, pairPoolsCount)
    )
    for (let k = 0; k < pairPools.length; ++k) {
      const poolAddress = pairPools[k]
      const poolContract = await new ethers.Contract(poolAddress, ConstantProductPoolABI, this.chainDataProvider)
      const [res0, res1] = await this.limited.call(() => poolContract.getReserves())
      const fee: BigNumber = await this.limited.call(() => poolContract.swapFee())
      const pool = new ConstantProductRPool(
        poolAddress, 
        convertTokenToBento(t0),
        convertTokenToBento(t1),
        parseInt(fee.toString())/1_000_000,
        res0,
        res1
      )
      pools.push(pool)
    }
    return pools
  }

  async _getAllPools(tokens: Token[]): Promise<RPool[]> {
    const factory = await new Contract(
      ConstantProductPoolFactory[this.network.chainId], 
      ConstantProductPoolFactoryABI, 
      this.chainDataProvider
    )
    const promises: Promise<RPool[]>[] = []
    const tokensSorted = sortTokens(tokens)
    for (let i = 0; i < tokensSorted.length; ++i) {
      for (let j = i+1; j < tokensSorted.length; ++j) {
        promises.push(
          this._getTokenPairPools(tokensSorted[i], tokensSorted[j], factory)
        )
      }
    }
    const poolArrays = await Promise.all(promises)
    const pools = poolArrays.reduce((a, b) => a.concat(b), [])
    return pools
  }

  _getAllRouteTokens(t1: Token, t2: Token) {
    const set = new Set<Token>([
      t1, 
      t2, 
      ...this.network.BASES_TO_CHECK_TRADES_AGAINST, 
      ...(this.network.ADDITIONAL_BASES[t1.address] || []),
      ...(this.network.ADDITIONAL_BASES[t2.address] || []),
     ])
     return Array.from(set)
  }
}