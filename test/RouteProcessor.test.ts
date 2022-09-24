import { ethers } from "hardhat";
import { expect } from "chai";
import { RouteProcessor__factory } from "../types";
import { Swapper } from "../scripts/Swapper";
import * as ETHEREUM from '../scripts/liquidityProviders/EthereumTokens'
import { getBigNumber } from "@sushiswap/tines";
import { WETH9ABI } from "../ABI/WETH9";

describe("RouteProcessor", async function () {
  it("Router WETH => FEI check", async function () {
    console.log("1. Router deployment ...");    
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
      to: ETHEREUM.WETH9.address,
      value: amountIn
    })
    console.log("4. Approve user's WETH to the router ...");    
    const WETH9 = await new ethers.Contract(ETHEREUM.WETH9.address, WETH9ABI, Alice)
    await await WETH9.connect(Alice).approve(routeProcessor.address, amountIn)

    console.log("5. Fetch Sushiswap pools' data ...");    
    const provider = new ethers.providers.AlchemyProvider("homestead", process.env.ALCHEMY_API_KEY)
    const swapper = new Swapper(routeProcessor.address, provider)
    const route = await swapper.getRoute(ETHEREUM.WETH9, amountIn, ETHEREUM.FEI)
    console.log("6. Create Route ...")
    route.legs.forEach(l => {
      console.log(`    ${l.tokenFrom.name} ${Math.round(l.absolutePortion*100)}% -> ${l.tokenTo.name}`);
    })
    console.log('7. Create router code ...');    
    const code = swapper.getRouterProcessorCode(route, Alice.address)
    console.log('8. Call router ...');    
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
