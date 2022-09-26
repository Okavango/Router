import { ethers } from "hardhat";
import { expect } from "chai";
import { RouteProcessor__factory } from "../types";
import { Swapper } from "../scripts/Swapper";
import {ETHEREUM} from '../scripts/networks/Ethereum'
import { getBigNumber } from "@sushiswap/tines";
import { WETH9ABI } from "../ABI/WETH9";
import { Network, Token } from "../scripts/networks/Network";


// Swaps amountIn basewrappedToken(WETH, ...) to toToken
async function testRouteProcessor(net: Network, amountIn: number, toToken: Token) {
  console.log("1. RouteProcessor deployment ...");    
  const RouteProcessor: RouteProcessor__factory = await ethers.getContractFactory(
    "RouteProcessor"
  );
  const routeProcessor = await RouteProcessor.deploy();    
  await routeProcessor.deployed();
  
  console.log("2. User creation ...");
  const amountInBN = getBigNumber(amountIn * 1e18)
  const [Alice] = await ethers.getSigners()

  console.log(`3. Deposit user's ${amountIn} ${net.baseTokenSymbol} to ${net.baseWrappedToken.symbol}`)
  await Alice.sendTransaction({ 
    to: net.baseWrappedToken.address,
    value: amountInBN
  })
  
  console.log(`4. Approve user's ${net.baseWrappedToken.symbol} to the route processor ...`);    
  const WrappedBaseTokenContract = await new ethers.Contract(net.baseWrappedToken.address, WETH9ABI, Alice)
  await WrappedBaseTokenContract.connect(Alice).approve(routeProcessor.address, amountInBN)

  console.log("5. Fetch Sushiswap and Uniswap pools' data ...");    
  const provider = new ethers.providers.AlchemyProvider("homestead", process.env.ALCHEMY_API_KEY)
  const swapper = new Swapper(routeProcessor.address, provider, net)
  const [route, poolsNumber] = await swapper.getRoute(net.baseWrappedToken, amountInBN, toToken)
  console.log(`    ${poolsNumber} pools were found`)

  console.log("6. Create Route ...")
  console.log(`    Input: ${route.amountInBN} ${route.fromToken.name}`);    
  route.legs.forEach(l => {
    console.log(
      `    ${l.tokenFrom.name} ${Math.round(l.absolutePortion*100)}%`
      + ` ${swapper.getPoolsProviderName(l.poolAddress)} -> ${l.tokenTo.name}`);
  })
  console.log(`    Output: ${route.amountOutBN} ${route.toToken.name}`);

  console.log('7. Create route processor code ...');    
  const code = swapper.getRouteProcessorCode(route, Alice.address)

  console.log('8. Call route processor ...');    
  const amountOutMin = route.amountInBN.mul(getBigNumber((1 - 0.005)*1_000_000)).div(1_000_000)
  const tx = await routeProcessor.processRouteEOA(
    net.baseWrappedToken.address, 
    amountInBN, 
    toToken.address, 
    amountOutMin, 
    Alice.address,
    code
  )
  const receipt = await tx.wait()
  
  console.log('9. Fetching user\'s output balance ...')
  const toTokenContract = await new ethers.Contract(toToken.address, WETH9ABI, Alice)
  const balanceOutBN = await toTokenContract.connect(Alice).balanceOf(Alice.address)
  console.log(`    expected amountOut: ${route.amountOutBN.toString()}`);
  console.log(`    real amountOut:     ${balanceOutBN.toString()}`);
  const slippage = parseInt(balanceOutBN.sub(route.amountOutBN).mul(10_000).div(balanceOutBN).toString())
  console.log(`    slippage: ${slippage/100}%`)
  console.log(`    gas use: ${receipt.gasUsed.toString()}`)
}

describe("RouteProcessor", async function () {
  it("Ethereum WETH => FEI check", async function () {

    await testRouteProcessor(ETHEREUM, 10, ETHEREUM.tokens.FEI)
  })
/*
    console.log("1. RouteProcessor deployment ...");    
    const RouteProcessor: RouteProcessor__factory = await ethers.getContractFactory(
      "RouteProcessor"
    );
    const routeProcessor = await RouteProcessor.deploy();    
    await routeProcessor.deployed();
    
    console.log("2. User creation ...");    
    const amountIn = getBigNumber(10e18)
    const [Alice] = await ethers.getSigners()

    console.log("3. Deposit user's 10ETH to WETH9")
    await Alice.sendTransaction({ 
      to: ETHEREUM.tokens.WETH9.address,
      value: amountIn
    })
    
    console.log("4. Approve user's WETH to the route processor ...");    
    const WETH9 = await new ethers.Contract(ETHEREUM.tokens.WETH9.address, WETH9ABI, Alice)
    await WETH9.connect(Alice).approve(routeProcessor.address, amountIn)

    console.log("5. Fetch Sushiswap and Uniswap pools' data ...");    
    const provider = new ethers.providers.AlchemyProvider("homestead", process.env.ALCHEMY_API_KEY)
    const swapper = new Swapper(routeProcessor.address, provider, ETHEREUM)
    const [route, poolsNumber] = await swapper.getRoute(ETHEREUM.tokens.WETH9, amountIn, ETHEREUM.tokens.FEI)
    console.log(`    ${poolsNumber} pools were found`)

    console.log("6. Create Route ...")
    console.log(`    Input: ${route.amountInBN} ${route.fromToken.name}`);    
    route.legs.forEach(l => {
      console.log(
        `    ${l.tokenFrom.name} ${Math.round(l.absolutePortion*100)}%`
        + ` ${swapper.getPoolsProviderName(l.poolAddress)} -> ${l.tokenTo.name}`);
    })
    console.log(`    Output: ${route.amountOutBN} ${route.toToken.name}`);

    console.log('7. Create route processor code ...');    
    const code = swapper.getRouteProcessorCode(route, Alice.address)

    console.log('8. Call route processor ...');    
    const amountOutMin = route.amountInBN.mul(getBigNumber((1 - 0.005)*1_000_000)).div(1_000_000)
    const tx = await routeProcessor.processRouteEOA(
      ETHEREUM.tokens.WETH9.address, 
      amountIn, 
      ETHEREUM.tokens.FEI.address, 
      amountOutMin, 
      Alice.address,
      code
    )
    const receipt = await tx.wait()
    
    console.log('9. Fetching user\'s output balance ...')
    const FEI = await new ethers.Contract(ETHEREUM.tokens.FEI.address, WETH9ABI, Alice)
    const balanceOutBN = await FEI.connect(Alice).balanceOf(Alice.address)
    console.log(`    expected amountOut: ${route.amountOutBN.toString()}`);
    console.log(`    real amountOut:     ${balanceOutBN.toString()}`);
    const slippage = parseInt(balanceOutBN.sub(route.amountOutBN).mul(10_000).div(balanceOutBN).toString())
    console.log(`    slippage: ${slippage/100}%`)
    console.log(`    gas use: ${receipt.gasUsed.toString()}`)
  });*/
});
