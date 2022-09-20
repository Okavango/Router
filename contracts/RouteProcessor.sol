// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

import "../interfaces/IERC20.sol";

uint constant BALANCE_NUM = 20;

contract RouteProcessor {

  // To be used in UI. For External Owner Account only
  function processRouteEOA(bytes calldata route) external payable {
    require(tx.origin == msg.sender, "Call from not EOA");      // Prevents reentrance

    uint position = 0;  // current reading position in route
    uint[BALANCE_NUM] memory balances; // Array of remembered initial balances - for amountOunMin checking

    while(position < route.length) {
      uint8 commandCode = uint8(route[position]);
      if        (commandCode == 1) { // send ETH from this contract to an address
        position = sendETHShare(route, position + 1);
      } else if (commandCode == 2) { // send ERC20 tokens from this router to an address
        position = sendERC20Share(route, position + 1);
      } else if (commandCode == 3) { // transfer ERC20 tokens from msg.sender to an address
        position = transferERC20(route, position + 1);

      } else if (commandCode == 10) { // call a function of a contract - pool.swap for example
        position = contractCall(route, position + 1);
      } else if (commandCode == 11) { // call a function of a contract with {value: x, gas: y}
        position = contractCallValueGas(route, position + 1);

      } else if (commandCode == 20) { // checks self ETH balance - for amountOutMin checks
        position = checkSelfBalanceETH(route, position + 1);
      } else if (commandCode == 21) { // checks self ERC20 balance - for amountOutMin checks
        position = checkSelfBalanceERC20(route, position + 1);
      } else if (commandCode == 22) { // remembers initial ERC20 balance of an address - for amountOutMin checks
        position = getBalanceERC20(route, position + 1, balances);
      } else if (commandCode == 23) { // checks an address ERC20 balance increasing - for amountOutMin checks
        position = checkBalanceERC20(route, position + 1, balances);
      } else revert("Unknown command code");
    }
  }

  // Send ETH from this contract to an address
  function sendETHShare(bytes calldata route, uint position) private returns (uint) {
    (address payable to, uint16 share) = abi.decode(route[position:], (address, uint16));    

    uint amount; unchecked {
      amount = address(this).balance * share/65535;
    }
    to.transfer(amount);

    return position + 22;
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
  function transferERC20(bytes calldata route, uint position) private returns (uint) {
    (address token, address to, uint amount) = abi.decode(
      route[position:], 
      (address, address, uint)
    );
    IERC20(token).transferFrom(msg.sender, to, amount);
    
    return position + 72;
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

  // Checks self ETH balance - for amountOutMin checks
  function checkSelfBalanceETH(bytes calldata route, uint position) private view returns (uint) {
    (uint amountMin) = abi.decode(route[position:], (uint));
    require(address(this).balance >= amountMin, "Insufficient ETH liquidity");

    return position + 32;
  }

  // Checks self ERC20 balance - for amountOutMin checks
  function checkSelfBalanceERC20(bytes calldata route, uint position) private  view returns (uint) {
    (address token, uint amountMin) = abi.decode(route[position:], (address, uint));
    require(IERC20(token).balanceOf(address(this)) >= amountMin, "Insufficient liquidity");

    return position + 52;
  }

  // Remembers initial ERC20 balance of an address - for amountOutMin checks
  // Supposed to be called before routing
  function getBalanceERC20(
    bytes calldata route, 
    uint position, 
    uint[BALANCE_NUM] memory balances
  ) private view returns (uint) {
    (address token, address host, uint8 n) = abi.decode(route[position:], (address, address, uint8));
    require(n < BALANCE_NUM, "Wrong balance number");
    balances[n] = IERC20(token).balanceOf(address(host));
    return position + 41;
  }

  // Checks an address ERC20 balance increasing. Supposed to be called after routing
  function checkBalanceERC20(
    bytes calldata route, 
    uint position, 
    uint[BALANCE_NUM] memory balances
  ) private view returns (uint) {
    (address token, address host, uint8 n, uint amountMin) = abi.decode(
      route[position:], 
      (address, address, uint8, uint)
    );
    require(n < BALANCE_NUM, "Wrong balance number");

    uint currentBalance = IERC20(token).balanceOf(address(host));
    require(balances[n] + amountMin <= currentBalance, "Insufficient liquidity");

    return position + 73;
  }

}
