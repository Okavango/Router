
import {getBigNumber, MultiRoute, RouteLeg, RouteStatus, RToken} from "@sushiswap/tines"
import { assert } from "console";
import { BigNumber, ethers } from "ethers";
import { PoolRegistarator } from "./liquidityProviders/LiquidityProvider";

export function getRouteProcessorCode(
  route: MultiRoute, 
  routeProcessorAddress: string, 
  toAddress: string,
  minLiquidity: BigNumber,
  reg: PoolRegistarator
): string {
  // 0. Check for no route
  if (route.status == RouteStatus.NoWay || route.legs.length == 0) return ''

  const tokenOutputLegs = getTokenOutputLegs(route)
  //const tokenTransferred = new Map<string, BigNumber>()
  
  // 1. Remember user's output balance
  let res = codeRememberBalance(route.toToken, toAddress, 0)

  // 2. Transfer route.amountIn input tokens from msg.sender to all input pools according to proportion 'leg.absolutePortion'
  const inputLegs = tokenOutputLegs.get(route.fromToken.tokenId as string) as RouteLeg[]
  let inputAmountPrevious: BigNumber = BigNumber.from(0)
  inputLegs.forEach(l => {
    const amount: BigNumber = l.swapPortion != 1 ? 
      getBigNumber(route.amountIn * l.absolutePortion) : route.amountInBN.sub(inputAmountPrevious)
    res += codeTransferERC20(route.fromToken, l.poolAddress, amount)
    inputAmountPrevious = inputAmountPrevious.add(amount)
  })
  assert(inputAmountPrevious.eq(route.amountInBN))

  route.legs.forEach(l => {
    // 3.1 Transfer tokens from the routeProcessor contract to the pool if it is necessary
    const neibourLegs = tokenOutputLegs.get(l.tokenFrom.tokenId as string) as RouteLeg[]
    if (neibourLegs.length > 1 && l.tokenFrom != route.fromToken) {
      res += codeSendERC20(route.fromToken, l.poolAddress, l.swapPortion)
    }

    // 3.2 Make swap
    const outLegs = tokenOutputLegs.get(l.tokenTo.tokenId as string)
    let outAddress
    if (outLegs == undefined) {
      // output leg - send swap's output directly to toAddress
      outAddress = toAddress
    } else if (outLegs.length == 1) {
      // swap without fork - send swap's output directly to the next pool
      outAddress = outLegs[0].poolAddress
    } else {
      // swap without further fork - send swap's output to the RouteProcessor
      outAddress = routeProcessorAddress
    }
    res += codeSwap(l, outAddress, reg)
  })

  // 4. TODO: check minoutput
  res += codeCheckBalance(route.toToken, toAddress, 0, minLiquidity)

  return res;
}

function getTokenOutputLegs(route: MultiRoute): Map<string, RouteLeg[]> {
  const res = new Map<string, RouteLeg[]>()

  route.legs.forEach(l => {
    const chainId = l.tokenFrom.chainId?.toString()
    if (chainId === undefined) {
      assert(0)
    } else {
      const legsOutput = res.get(chainId) || []
      legsOutput.push(l)
      res.set(chainId, legsOutput)
    }
  })

  return res
}

// Transfers tokens from msg.sender to a pool
function codeTransferERC20(token: RToken, poolAddress: string, amount: BigNumber): string {
  const code = ethers.utils.defaultAbiCoder.encode(
    ["uint8", "address", "address", "uint"], 
    [3, token.address, poolAddress, amount]
  );
  assert(code.length == 73)
  return code
}

// Sends tokens from the RouteProcessor to a pool
function codeSendERC20(token: RToken, poolAddress: string, share: number): string {
  const code = ethers.utils.defaultAbiCoder.encode(
    ["uint8", "address", "address", "uint"], 
    [2, token.address, poolAddress, Math.round(share*65535)]
  );
  assert(code.length == 43)
  return code
}

function codeRememberBalance(token: RToken, address: string, slot: number): string {
  const code = ethers.utils.defaultAbiCoder.encode(
    ["uint8", "address", "address", "uint8"], 
    [22, token.address, address, slot]
  );
  assert(code.length == 42)
  return code
}
function codeCheckBalance(token: RToken, address: string, slot: number, minLiquidity: BigNumber): string {
  const code = ethers.utils.defaultAbiCoder.encode(
    ["uint8", "address", "address", "uint8", "uint"], 
    [23, token.address, address, slot, minLiquidity]
  );
  assert(code.length == 74)
  return code
}

function codeSwap(leg: RouteLeg, toAddress: string, reg: PoolRegistarator): string {
  const provider = reg.getProvider(leg.poolAddress)
  if (provider !== undefined) {
    const code = provider.getSwapCodeForRouteProcessor(leg, toAddress)
    return code
  } else {
    throw new Error("unknown pool: " + leg.poolAddress)
  }
}