
import {getBigNumber, MultiRoute, RouteLeg, RouteStatus, RToken} from "@sushiswap/tines"
import { assert } from "console";
import { BigNumber, ethers } from "ethers";

export function tinesToRouter(route: MultiRoute, routerAddress: string, toAddress: string): string {
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
    // 3.1 Transfer tokens from the router to the pool if it is necessary
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
      // swap without further fork - send swap's output to the router
      outAddress = routerAddress
    }
    res += codeSwap(l.poolAddress, l.tokenFrom, outAddress)
  })

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

// Sends tokens from the router to a pool
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

function codeSwap(poolAddress: string, tokenFrom: RToken, toAddress: string): string {
  // To implement
}