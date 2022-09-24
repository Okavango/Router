import { ethers } from "hardhat";
import { expect } from "chai";
import { RouteProcessor__factory } from "../types";
import { Swapper } from "../scripts/Swapper";
import * as ETHEREUM from '../scripts/liquidityProviders/EthereumTokens'
import { getBigNumber } from "@sushiswap/tines";
import { WETH9ABI } from "../ABI/WETH9";

describe("RouteProcessor", async function () {
  it("Deploy check", async function () {
    const RouteProcessor: RouteProcessor__factory = await ethers.getContractFactory(
      "RouteProcessor"
    );
    const routeProcessor = await RouteProcessor.deploy();    
    await routeProcessor.deployed();
      
    const amountIn = getBigNumber(10e18)
    const [Alice] = await ethers.getSigners()
    // make Alice have 10 WETH9
    await Alice.sendTransaction({ 
      to: ETHEREUM.WETH9.address,
      value: amountIn
    })
    // approve WETH to the router
    const WETH9 = await new ethers.Contract(ETHEREUM.WETH9.address, WETH9ABI, Alice)
    await await WETH9.connect(Alice).approve(routeProcessor.address, amountIn)

    const provider = new ethers.providers.AlchemyProvider("homestead", process.env.ALCHEMY_API_KEY)
    const swapper = new Swapper(routeProcessor.address, provider)
    const route = await swapper.getRoute(ETHEREUM.WETH9, amountIn, ETHEREUM.FEI)
    const code = swapper.getRouterProcessorCode(route, Alice.address)
    const amountOutMin = route.amountInBN.mul(getBigNumber((1 - 0.005)*1_000_000)).div(1_000_000)
    await routeProcessor.processRouteEOA(
      ETHEREUM.WETH9.address, 
      amountIn, 
      ETHEREUM.FEI.address, 
      amountOutMin, 
      Alice.address,
      code
    )
  });
});
