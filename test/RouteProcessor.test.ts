import { ethers, network } from "hardhat";
import { RouteProcessor__factory } from "../types/index";
import { Swapper } from "../scripts/Swapper";
import {ETHEREUM} from '../scripts/networks/Ethereum'
import { getBigNumber } from "@sushiswap/tines";
import { WETH9ABI } from "../ABI/WETH9";
import { Network, Token } from "../scripts/networks/Network";
import { POLYGON } from "../scripts/networks/Polygon";
import { HardhatNetworkConfig } from "hardhat/types";
import { HEXer } from "../scripts/HEXer";
import { ERC20ABI } from "../ABI/ERC20";
import { BentoBox } from "../scripts/liquidityProviders/Trident";

const delay = async ms => new Promise(res => setTimeout(res, ms));

// Swaps amountIn basewrappedToken(WETH, ...) to toToken
async function testRouteProcessor(net: Network, amountIn: number, toToken: Token, swaps = 1) {
  console.log(`1. ${net.name} RouteProcessor deployment ...`);  
  const provider = new ethers.providers.AlchemyProvider(...net.alchemyProviderArgs)  
  const RouteProcessor: RouteProcessor__factory = await ethers.getContractFactory(
    "RouteProcessor"
  );
  const routeProcessor = await RouteProcessor.deploy(
    BentoBox[net.chainId] || "0x0000000000000000000000000000000000000000"
  );    
  await routeProcessor.deployed();
  
  console.log("2. User creation ...");
  const amountInBN = getBigNumber(amountIn * 1e18)
  const [Alice] = await ethers.getSigners()

    console.log(`3. Deposit user's ${amountIn} ${net.baseTokenSymbol} to ${net.baseWrappedToken.symbol}`)
    await Alice.sendTransaction({ 
      to: net.baseWrappedToken.address,
      value: amountInBN.mul(swaps)
    })
    
  console.log(`4. Approve user's ${net.baseWrappedToken.symbol} to the route processor ...`);    
  const WrappedBaseTokenContract = await new ethers.Contract(net.baseWrappedToken.address, WETH9ABI, Alice)
  await WrappedBaseTokenContract.connect(Alice).approve(routeProcessor.address, amountInBN.mul(swaps))

  console.log("5. Fetch pools' data ...");    
  const swapper = new Swapper(routeProcessor.address, provider, net)
  const route = await swapper.getRoute(net.baseWrappedToken, amountInBN, toToken)
  console.log(
    `    RPC calls were done total: ${swapper.limited.counterTotalCall}, failed: ${swapper.limited.counterFailedCall}`
  );
  Object.keys(swapper.poolsNumber).forEach(provider => {
    console.log(`    ${provider}: ${swapper.poolsNumber[provider]} pools were found`)
  })

  console.log("6. Create Route ...")
  console.log(`    Input: ${amountIn} ${route.fromToken.name}`);    
  route.legs.forEach(l => {
    console.log(
      `    ${l.tokenFrom.name} ${Math.round(l.absolutePortion*100)}%`
      + ` -> [${swapper.getPoolsProviderName(l.poolAddress)}] -> ${l.tokenTo.name}`);
  })
  const output = Math.round(parseInt(route.amountOutBN.toString())/Math.pow(10, toToken.decimals)*100)/100
  console.log(`    Output: ${output} ${route.toToken.name}`);

  console.log('7. Create route processor code ...');    
  const code = swapper.getRouteProcessorCode(route, Alice.address)

    
  for (let i = 0; i < swaps; ++i) {
    console.log('8. Call route processor ...');    
    const amountOutMin = 
      i > 0 ? getBigNumber(0) : route.amountOutBN.mul(getBigNumber((1 - 0.005)*1_000_000)).div(1_000_000)
    await delay(1000) // to make Alchemy API rest a while
    
    const toTokenContract = await new ethers.Contract(toToken.address, WETH9ABI, Alice)
    const balanceOutBNBefore = await toTokenContract.connect(Alice).balanceOf(Alice.address)
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
    const balanceOutBN = (await toTokenContract.connect(Alice).balanceOf(Alice.address)).sub(balanceOutBNBefore)
    console.log(`    expected amountOut: ${route.amountOutBN.toString()}`);
    console.log(`    real amountOut:     ${balanceOutBN.toString()}`);
    const slippage = parseInt(balanceOutBN.sub(route.amountOutBN).mul(10_000).div(route.amountOutBN).toString())
    console.log(`    slippage: ${slippage/100}%`)
    console.log(`    gas use: ${receipt.gasUsed.toString()}`)
  }
}

describe("RouteProcessor", async function () {
  it.skip("Contract call check", async function () {
    const forking_url = (network.config as HardhatNetworkConfig)?.forking?.url;
    if (forking_url !== undefined && forking_url.search('polygon') >= 0) {
      const erc20 = new ethers.utils.Interface(ERC20ABI);
      const callDataHex: string = erc20.encodeFunctionData('symbol', []);

      const code = new HEXer()
        .uint8(10).address(POLYGON.tokens.WMATIC.address)
        .uint16(callDataHex.length/2 - 1)   // -1 for 0x
        .hexData(callDataHex).toString0x()
      
      const RouteProcessor: RouteProcessor__factory = await ethers.getContractFactory(
        "RouteProcessor"
      );
      const routeProcessor = await RouteProcessor.deploy(BentoBox[POLYGON.chainId]);    
      await routeProcessor.deployed();

      console.log(code);
      
      await routeProcessor.processRouteEOA(
        POLYGON.tokens.WMATIC.address, 
        0, 
        POLYGON.tokens.WMATIC.address, 
        0, 
        POLYGON.tokens.WMATIC.address,
        code
      )
    }
  })

  it("Ethereum WETH => FEI check", async function () {
    const forking_url = (network.config as HardhatNetworkConfig)?.forking?.url;
    if (forking_url !== undefined && forking_url.search('eth-mainnet') >= 0) {
      await testRouteProcessor(ETHEREUM, 10, ETHEREUM.tokens.FEI)
    }
  })

  it("Polygon WMATIC => FEI check", async function () {
    const forking_url = (network.config as HardhatNetworkConfig)?.forking?.url;
    if (forking_url !== undefined && forking_url.search('polygon') >= 0) {
      await testRouteProcessor(POLYGON, 1_000_000, POLYGON.tokens.SUSHI)
    }
  })

  it.skip("Polygon 5 swaps test", async function () {
    const forking_url = (network.config as HardhatNetworkConfig)?.forking?.url;
    if (forking_url !== undefined && forking_url.search('polygon') >= 0) {
      await testRouteProcessor(POLYGON, 1000000, POLYGON.tokens.SUSHI, 5)
    }
  })
});
