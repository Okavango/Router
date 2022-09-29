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

function getAllRouteTokens(net: Network,  t1: Token, t2: Token) {
  const set = new Set<Token>([
    t1, 
    t2, 
    ...net.BASES_TO_CHECK_TRADES_AGAINST, 
    ...(net.ADDITIONAL_BASES[t1.address] || []),
    ...(net.ADDITIONAL_BASES[t2.address] || []),
   ])
   return Array.from(set)
}

function convertTokenToBento(token: Token): RToken {
  const t = {...token}
  t.name = `Bnt Share(${token.name})`
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

const limited = new Limited(5, 1000)

async function getAllPools(net: Network, tokens: Token[], chainDataProvider: ethers.providers.BaseProvider): Promise<RPool[]> {
  const factory = await new Contract(
    ConstantProductPoolFactory[net.chainId], 
    ConstantProductPoolFactoryABI, 
    chainDataProvider
  )
  const poolData: RPool[] = []
  const tokensSorted = sortTokens(tokens)
  for (let i = 0; i < tokensSorted.length; ++i) {
    for (let j = i+1; j < tokensSorted.length; ++j) {
      const pairPoolsCount = await limited.call(
        () => factory.poolsCount(tokensSorted[i].address, tokensSorted[j].address)
      )
      if (pairPoolsCount == 0) continue
      const pairPools: string[] = await limited.call(
        () => factory.getPools(tokensSorted[i].address, tokensSorted[j].address, 0, pairPoolsCount)
      )
      for (let k = 0; k < pairPools.length; ++k) {
        const poolAddress = pairPools[k]
        const poolContract = await new ethers.Contract(poolAddress, ConstantProductPoolABI, chainDataProvider)
        const [res0, res1] = await limited.call(() => poolContract.getReserves())
        const fee: BigNumber = await limited.call(() => poolContract.swapFee())
        const pool = new ConstantProductRPool(
          poolAddress, 
          convertTokenToBento(tokensSorted[i]),
          convertTokenToBento(tokensSorted[j]),
          parseInt(fee.toString())/1_000_000,
          res0,
          res1
        )
        poolData.push(pool)
      }
    }
  }
  return poolData
}

export class TridentProvider extends LiquidityProvider {
  pools: Map<string, RPool>
  chainDataProvider: ethers.providers.BaseProvider
  network: Network

  constructor(r: PoolRegistarator, chainDataProvider: ethers.providers.BaseProvider, net: Network) {
    super(r)
    this.pools = new Map<string, RPool>()
    this.chainDataProvider = chainDataProvider
    this.network = net
  }

  getProviderName(): string {return 'Trident'}

  async getPools(t0: Token, t1: Token): Promise<RPool[]> {
    if (ConstantProductPoolFactory[this.network.chainId] === undefined) {
      // No trident for this network
      return []
    }
    const tokens = getAllRouteTokens(this.network, t0, t1)
    const pools = await getAllPools(this.network, tokens, this.chainDataProvider)
    this.registrator.addPools(pools.map(p => p.address), this)
    pools.forEach(p => this.pools.set(p.address, p))
    console.log("API calls: ", limited.counter);
    
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
}