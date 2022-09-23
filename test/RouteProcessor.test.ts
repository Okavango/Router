import { ethers } from "hardhat";
import { expect } from "chai";
import { RouteProcessor__factory } from "../types";
import { Swapper } from "../scripts/Swapper";
import * as ETHEREUM from '../scripts/liquidityProviders/EthereumTokens'
import { getBigNumber } from "@sushiswap/tines";
import { WETH9ABI } from "../ABI/WETH9";

describe("RouteProcessor", async function () {
  it("Deploy check", async function () {
    const provider = new ethers.providers.AlchemyProvider("homestead", process.env.ALCHEMY_API_KEY)

    const [Alice] = await ethers.getSigners()
    await Alice.sendTransaction({ // make Alice have 10 WETH9
      to: ETHEREUM.WETH9.address,
      value: getBigNumber(10e18)
    })
    //const WETH9 = await new ethers.Contract(ETHEREUM.WETH9.address, WETH9ABI, Alice)
    //const txGetWETH = await WETH9.connect(Alice).deposit({value: getBigNumber(1e18)})
    //await Alice.populateTransaction(WETH9, "deposit()", [])
    //console.log(res)
    // const balanceAfter = parseInt((await WETH9.balanceOf(Alice.address)).toString())
    // console.log(balanceAfter); 

    const RouteProcessor: RouteProcessor__factory = await ethers.getContractFactory(
      "RouteProcessor"
    );
    const routeProcessor = await RouteProcessor.deploy();

    await routeProcessor.deployed();
    
    const swapper = new Swapper(routeProcessor.address, provider)
    const route = await swapper.getRoute(ETHEREUM.WETH9, getBigNumber(10e18), ETHEREUM.FEI)
    const code = swapper.getRouterProcessorCode(route, Alice.address)

    expect(code).not.equals('')
  });
});
