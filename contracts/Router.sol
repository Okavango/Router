// SPDX-License-Identifier: MIT

pragma solidity 0.8.11;

import "../interfaces/IERC20.sol";

contract Router {

  // To be used in UI. For External Owner Account only
  function processRouteEOA(bytes calldata route) external payable {
    require(tx.origin == msg.sender, "Call from not EOA");      // Prevents reentrance and usage in hacker attacks
    uint position = 0;
    while(position < route.length) {
      uint8 commandCode = uint8(route[position]);
      if (commandCode == 1) { // send ERC20 tokens from this contract to an address
        position = sendETHShare(route, position + 1);
      } else if (commandCode == 2) { // transfer ERC20 tokens from an address to an address
        position = sendERC20Share(route, position + 1);
      } else if (commandCode == 3) { // transfer ERC20 tokens from an address to an address
        position = transferERC20(route, position + 1);
      } else if (commandCode == 10) { // call a function of a contract
        position = contractCall(route, position + 1);
      } else if (commandCode == 11) { // call a function of a contract with {value: x, gas: y}
        position = contractCallValueGas(route, position + 1);
      } else revert("Unknown command code");
    }
  }

  // Sends ETH from this contract.
  function sendETHShare(bytes calldata route, uint position) private returns (uint) {
    (address payable to, uint16 share) = abi.decode(route[position:], (address, uint16));    

    uint amount; unchecked {
      amount = address(this).balance * share/65535;
    }
    to.transfer(amount);

    return position + 22;
  }

  // Sends ERC20 tokens from this contract.
  function sendERC20Share(bytes calldata route, uint position) private returns (uint) {
    (address token, address to, uint16 share) = abi.decode(route[position:], (address, address, uint16));

    uint amount; unchecked {
      amount = IERC20(token).balanceOf(address(this))*share/65535;
    }
    IERC20(token).transfer(to, amount);

    return position + 42;
  }

  // Transfers ERC20 tokens from an address to an address. Tokens should be approved
  function transferERC20(bytes calldata route, uint position) private returns (uint) {
    (address token, address to, uint amount) = abi.decode(
      route[position:], 
      (address, address, uint)
    );
    IERC20(token).transferFrom(msg.sender, to, amount);
    
    return position + 72;
  }

  // Calls a function of a contract
  function contractCall(bytes calldata route, uint position) private returns (uint) {
    (address aContract, uint16 callDataSize) = abi.decode(route[position:], (address, uint16));
    position += 22;
    bytes calldata callData = route[position:position + callDataSize];

    (bool result, bytes memory returnData) = aContract.call(callData);
    require(result, string(returnData));
    
    return position + callDataSize;
  }

  // Calls a function of a contract with {value: x, gas: y}
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

}
