// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

import "../interfaces/IERC20.sol";
import "../interfaces/IUniswapV2Pair.sol";

contract RouteProcessor2 {

  // To be used in UI. For External Owner Account only
  function processRouteEOA(
    address tokenIn,
    uint amountIn,
    address tokenOut,
    uint amountOutMin,
    address to,
    bytes calldata route
  ) external payable  returns (uint amountOut){
    require(tx.origin == msg.sender, "Call from not EOA");      // Prevents reentrance

    uint amountInAcc = 0;
    uint balanceInitial = IERC20(tokenOut).balanceOf(to);

    uint position = 0;  // current reading position in route
    while(position < route.length) {
      uint8 commandCode = uint8(route[position]);
      if        (commandCode == 1) { // transfer ERC20 tokens from msg.sender to an address
        uint transferAmount;
        (transferAmount, position) = transferERC20Amount(tokenIn, route, position + 1);
        amountInAcc += transferAmount;
      } else if (commandCode == 2) { // send ERC20 tokens from this router to an address
        position = sendERC20Share(route, position + 1);

      } else if (commandCode == 10) { // call a function of a contract - pool.swap for example
        position = contractCall(route, position + 1);
      } else if (commandCode == 11) { // call a function of a contract with {value: x, gas: y}
        position = contractCallValueGas(route, position + 1);

      } else if (commandCode == 20) { // Sushi/Uniswap pool swap
        (, position) = swapUniswapPool(route, position + 1);

      } else revert("Unknown command code");
    }

    require(amountInAcc == amountIn, "Wrong amountIn value");
    uint balanceFinal = IERC20(tokenOut).balanceOf(to);
    require(balanceFinal >= balanceInitial + amountOutMin, "Minimal ouput balance violation");

    amountOut = balanceFinal - balanceInitial;
  }

  // Send ERC20 tokens from this router to an address. Quantity for sending is determined by share in 1/65535.
  // During routing we can't predict in advance the actual value of internal swaps because of slippage,
  // so we have to work with shares - not fixed amounts
  function sendERC20Share(bytes calldata route, uint position) private returns (uint) {
    (address token, address to, uint16 share) = abi.decode(route[position:], (address, address, uint16));

    uint amount; unchecked {
      amount = IERC20(token).balanceOf(address(this))*share/65535;
    }
    IERC20(token).transfer(to, amount);

    return position + 42;
  }

  // Transfers ERC20 tokens from an address to an address. Tokens should be approved
  // Expected to be launched for initial liquidity distribution fro user to pools, so we know exact amounts
  function transferERC20Amount(address token, bytes calldata route, uint position) 
    private returns (uint amount, uint positionNew) {
    address to;
    (to, amount) = abi.decode(route[position:], (address, uint));
    IERC20(token).transferFrom(msg.sender, to, amount);    
    positionNew =  position + 52;
  }

  // Calls a function of a contract. Expected to be called for pool.swap functions
  function contractCall(bytes calldata route, uint position) private returns (uint) {
    (address aContract, uint16 callDataSize) = abi.decode(route[position:], (address, uint16));
    position += 22;
    bytes calldata callData = route[position:position + callDataSize];

    (bool result, bytes memory returnData) = aContract.call(callData);
    require(result, string(returnData));
    
    return position + callDataSize;
  }

  // Calls a function of a contract with {value: x, gas: y}. Expected to be called for pool.swap functions
  function contractCallValueGas(bytes calldata route, uint position) private returns (uint) {
    (address aContract, uint16 valueShare, uint32 gas, uint16 callDataSize) = abi.decode(
      route[position:], 
      (address, uint16, uint32, uint16)
    );
    position += 28;
    bytes calldata callData = route[position:position + callDataSize];

    uint value; unchecked {
      value = address(this).balance * valueShare / 65535;
    }

    bool result;
    bytes memory returnData;
    if (value != 0) {
      if (gas != 0) {
        (result, returnData) = aContract.call{value: value, gas: gas}(callData);
      } else {
        (result, returnData) = aContract.call{value: value}(callData);
      }
    } else {
      (result, returnData) = aContract.call{gas: gas}(callData);
      // use 'contractCall' function for case with no gas neither value
    }
    require(result, string(returnData));
    
    return position + callDataSize;
  }

  // Sushi/Uniswap pool swap
  function swapUniswapPool(bytes calldata data, uint position) 
    private returns (uint amountOut, uint positionNew) {
    (address pool, address tokenIn, bool direction, address to) = abi.decode(
      data[position:], 
      (address, address, bool, address)
    );
    positionNew = position + 61;

    (uint r0, uint r1,) = IUniswapV2Pair(pool).getReserves();
    require(r0 > 0 && r1 > 0, 'Wrong pool reserves');
    (uint reserveIn, uint reserveOut) = direction ? (r0, r1) : (r1, r0);

    uint amountIn = IERC20(tokenIn).balanceOf(pool) - reserveIn;
    uint amountInWithFee = amountIn * 997;
    amountOut = amountInWithFee * reserveOut / (reserveIn * 1000 + amountInWithFee);
    (uint amount0Out, uint amount1Out) = direction ? (uint(0), amountOut) : (amountOut, uint(0));
    IUniswapV2Pair(pool).swap(amount0Out, amount1Out, to, new bytes(0));
  }

}
