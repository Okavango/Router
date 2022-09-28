import { ethers, network } from "hardhat";
import { expect } from "chai";
import { RouteProcessor__factory } from "../types";
import { Swapper } from "../scripts/Swapper";
import {ETHEREUM} from '../scripts/networks/Ethereum'
import { getBigNumber } from "@sushiswap/tines";
import { WETH9ABI } from "../ABI/WETH9";
import { Network, Token } from "../scripts/networks/Network";
import { POLYGON } from "../scripts/networks/Polygon";
import { HardhatNetworkConfig } from "hardhat/types";


// Swaps amountIn basewrappedToken(WETH, ...) to toToken
async function testRouteProcessor(net: Network, amountIn: number, toToken: Token) {
  console.log(`1. ${net.name} RouteProcessor deployment ...`);    
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

  console.log("5. Fetch pools' data ...");    
  const provider = new ethers.providers.AlchemyProvider(...net.alchemyProviderArgs)  
  const swapper = new Swapper(routeProcessor.address, provider, net)
  const route = await swapper.getRoute(net.baseWrappedToken, amountInBN, toToken)
  Object.keys(swapper.poolsNumber).forEach(provider => {
    console.log(`    ${provider}: ${swapper.poolsNumber[provider]} pools were found`)
  })

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
  const amountOutMin = route.amountOutBN.mul(getBigNumber((1 - 0.005)*1_000_000)).div(1_000_000)
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
    const forking_url = (network.config as HardhatNetworkConfig)?.forking?.url;
    if (forking_url !== undefined && forking_url.search('eth-mainnet') >= 0) {
      await testRouteProcessor(ETHEREUM, 10, ETHEREUM.tokens.FEI)
    }
  })

  it("Polygon WMATIC => FEI check", async function () {
    const forking_url = (network.config as HardhatNetworkConfig)?.forking?.url;
    if (forking_url !== undefined && forking_url.search('polygon') >= 0) {
      await testRouteProcessor(POLYGON, 9000, POLYGON.tokens.SUSHI)
    }
  })
});
