// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MyNFT721 is ERC721 {
    constructor() ERC721("MyNFT721", "MNFT721") {}

    function mint(address to, uint64 id) public {
        _mint(to, id);
    }
}
