// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

library Helpers {
    function isERC721(address nftContract) internal view returns (bool) {
        try
            IERC721(nftContract).supportsInterface(type(IERC721).interfaceId)
        returns (bool result) {
            return result;
        } catch {
            return false;
        }
    }

    function isERC1155(address nftContract) internal view returns (bool) {
        try
            IERC1155(nftContract).supportsInterface(type(IERC1155).interfaceId)
        returns (bool result) {
            return result;
        } catch {
            return false;
        }
    }
}
