import { ConstantProductRPool, RouteLeg, RPool } from "@sushiswap/tines";
import {ethers} from 'ethers'
import { LiquidityProvider, PoolRegistarator } from "./LiquidityProvider";
import * as ETHEREUM from './EthereumTokens'
import {Token} from './EthereumTokens'
import { getCreate2Address } from "ethers/lib/utils";
import { keccak256, pack } from '@ethersproject/solidity'
import { SushiPoolABI } from "../../ABI/SushiPool";

export const BASES_TO_CHECK_TRADES_AGAINST = [
  ETHEREUM.WETH9,
  ETHEREUM.DAI,
  ETHEREUM.USDC,
  ETHEREUM.USDT,
  ETHEREUM.WBTC,
  ETHEREUM.RUNE,
  ETHEREUM.NFTX,
  ETHEREUM.STETH,
  ETHEREUM.OHM_V1,
  ETHEREUM.OHM_V2,
  ETHEREUM.MIM,
  ETHEREUM.FRAX,
  ETHEREUM.SUSHI,
  ETHEREUM.STG
]

export const ADDITIONAL_BASES: {[tokenAddress: string]: Token[]} = {
  [ETHEREUM.UST.address]: [ETHEREUM.MIR],
  [ETHEREUM.MIR.address]: [ETHEREUM.UST],
  '0xd36932143F6eBDEDD872D5Fb0651f4B72Fd15a84': [ETHEREUM.MIR, ETHEREUM.UST], // mAAPL
  '0x59A921Db27Dd6d4d974745B7FfC5c33932653442': [ETHEREUM.MIR, ETHEREUM.UST], // mGOOGL
  '0x21cA39943E91d704678F5D00b6616650F066fD63': [ETHEREUM.MIR, ETHEREUM.UST], // mTSLA
  '0xC8d674114bac90148d11D3C1d33C61835a0F9DCD': [ETHEREUM.MIR, ETHEREUM.UST], // mNFLX
  '0x13B02c8dE71680e71F0820c996E4bE43c2F57d15': [ETHEREUM.MIR, ETHEREUM.UST], // mQQQ
  '0xEdb0414627E6f1e3F082DE65cD4F9C693D78CCA9': [ETHEREUM.MIR, ETHEREUM.UST], // mTWTR
  '0x41BbEDd7286dAab5910a1f15d12CBda839852BD7': [ETHEREUM.MIR, ETHEREUM.UST], // mMSFT
  '0x0cae9e4d663793c2a2A0b211c1Cf4bBca2B9cAa7': [ETHEREUM.MIR, ETHEREUM.UST], // mAMZN
  '0x56aA298a19C93c6801FDde870fA63EF75Cc0aF72': [ETHEREUM.MIR, ETHEREUM.UST], // mBABA
  '0x1d350417d9787E000cc1b95d70E9536DcD91F373': [ETHEREUM.MIR, ETHEREUM.UST], // mIAU
  '0x9d1555d8cB3C846Bb4f7D5B1B1080872c3166676': [ETHEREUM.MIR, ETHEREUM.UST], // mSLV
  '0x31c63146a635EB7465e5853020b39713AC356991': [ETHEREUM.MIR, ETHEREUM.UST], // mUSO
  '0xf72FCd9DCF0190923Fadd44811E240Ef4533fc86': [ETHEREUM.MIR, ETHEREUM.UST], // mVIXY
  '0xF16E4d813f4DcfDe4c5b44f305c908742De84eF0': [ETHEREUM.ETH2X_FLI],
  [ETHEREUM.FEI.address]: [ETHEREUM.DPI],
  [ETHEREUM.FRAX.address]: [ETHEREUM.FXS],
  [ETHEREUM.FXS.address]: [ETHEREUM.FRAX],
  [ETHEREUM.WBTC.address]: [ETHEREUM.RENBTC],
  [ETHEREUM.RENBTC.address]: [ETHEREUM.WBTC],
  [ETHEREUM.PONT.address]: [ETHEREUM.PWING],
  [ETHEREUM.PWING.address]: [ETHEREUM.PONT],
  [ETHEREUM.PLAY.address]: [ETHEREUM.DOUGH],
  [ETHEREUM.DOUGH.address]: [ETHEREUM.PLAY],
  [ETHEREUM.IBETH.address]: [ETHEREUM.ALPHA],
  [ETHEREUM.ALPHA.address]: [ETHEREUM.IBETH],
  [ETHEREUM.HBTC.address]: [ETHEREUM.CREAM],
  [ETHEREUM.CREAM.address]: [ETHEREUM.HBTC],
  [ETHEREUM.DUCK.address]: [ETHEREUM.USDP],
  [ETHEREUM.USDP.address]: [ETHEREUM.DUCK],
  [ETHEREUM.BAB.address]: [ETHEREUM.BAC],
  [ETHEREUM.BAC.address]: [ETHEREUM.BAB],
  [ETHEREUM.LIFT.address]: [ETHEREUM.LFBTC],
  [ETHEREUM.LFBTC.address]: [ETHEREUM.LIFT],
  [ETHEREUM.CVXCRV.address]: [ETHEREUM.CRV],
  [ETHEREUM.CRV.address]: [ETHEREUM.CVXCRV],
  [ETHEREUM.WOOFY.address]: [ETHEREUM.YFI],
  [ETHEREUM.SPANK.address]: [ETHEREUM.RAI],
  [ETHEREUM.DOLA.address]: [ETHEREUM.INV],
  [ETHEREUM.AGEUR.address]: [ETHEREUM.ANGLE],
}

function getAllRouteTokens(t1: Token, t2: Token) {
  const set = new Set<Token>([
    t1, 
    t2, 
    ...BASES_TO_CHECK_TRADES_AGAINST, 
    ...ADDITIONAL_BASES[t1.address],
    ...ADDITIONAL_BASES[t2.address],
   ])
   return Array.from(set)
}

export function getPoolAddress(t1: Token, t2: Token): string {
  const [token0, token1] = t1.address.toLowerCase() < t2.address.toLowerCase() ? [t1, t2] : [t2, t1]
  return getCreate2Address(
    '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac', // factoryAddress,
    keccak256(['bytes'], [pack(['address', 'address'], [token0.address, token1.address])]),
    '0xe18a34eb0e04b04f7a0ac29a6e80748dca96319b42c54d679cb821dca90c6303' //INIT_CODE_HASH[token0.chainId]
  )
}

async function getPoolData(t0: Token, t1: Token): Promise<RPool|undefined> {
  const [token0, token1] = t0.address.toLowerCase() < t1.address.toLowerCase() ? [t0, t1] : [t1, t0]
  const poolAddress = getCreate2Address(
    '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac', // factoryAddress,
    keccak256(['bytes'], [pack(['address', 'address'], [token0.address, token1.address])]),
    '0xe18a34eb0e04b04f7a0ac29a6e80748dca96319b42c54d679cb821dca90c6303' //INIT_CODE_HASH[token0.chainId]
  )
  try {
    const pool = await new ethers.Contract(poolAddress, SushiPoolABI, ethers.getDefaultProvider())
    const reserves = await pool.getReserves()
    return new ConstantProductRPool(poolAddress, token0, token1, 0.003, reserves.reserve0, reserves.reserve1)
  } catch (e) {
    return undefined
  }
}

async function getAllPools(tokens: Token[]): Promise<RPool[]> {
  const poolData: Promise<RPool|undefined>[] = []
  for (let i = 0; i < tokens.length; ++i) {
    for (let j = i+1; j < tokens.length; ++j) {
      poolData.push(getPoolData(tokens[i], tokens[j]))
    }
  }
  const pools = await Promise.all(poolData)
  return pools.filter(p => p !== undefined) as RPool[]
}

export class SushiProvider extends LiquidityProvider {
  pools: Map<string, RPool>

  constructor(r: PoolRegistarator) {
    super(r)
    this.pools = new Map<string, RPool>()
  }

  async getPools(t0: Token, t1: Token): Promise<RPool[]> {
    const tokens = getAllRouteTokens(t0, t1)
    const pools = await getAllPools(tokens)
    this.registrator.addPools(pools.map(p => p.address), this)
    pools.forEach(p => this.pools.set(p.address, p))
    return pools
  }

  getSwapCodeForRouteProcessor(leg: RouteLeg, toAddress: string): string {
    const {poolAddress, tokenFrom} = leg
    const pool = this.pools.get(poolAddress)
    if (pool === undefined) {
      throw new Error("Unknown pool " + poolAddress)
    } else {
      if (tokenFrom.address !== pool.token0.address && tokenFrom.address !== pool.token1.address) {
        throw new Error(`Unknown token ${tokenFrom.address} for the pool ${poolAddress}`)
      }
      // const [amount0Out, amount1Out] = tokenFrom == pool.token0.address ? []
      // const res = '10' +
    }
  }
}