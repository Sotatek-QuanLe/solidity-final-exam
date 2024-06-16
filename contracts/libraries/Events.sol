// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Types} from "contracts/libraries/Types.sol";

library Events {
    event NFTListed(
        uint256 indexed listingId,
        address indexed seller,
        address nftContract,
        uint256 indexed tokenId,
        uint256 amount,
        uint256 price,
        address paymentToken,
        Types.SaleType saleType,
        uint256 endTime
    );
    event NFTPurchased(uint256 indexed listingId, address indexed buyer);
    event BidPlaced(
        uint256 indexed listingId,
        address indexed bidder,
        uint256 amount
    );
    event NFTWithdrawn(uint256 indexed listingId, address indexed seller);
    event AuctionFinalized(
        uint256 indexed listingId,
        address indexed winner,
        uint256 amount
    );
    event Blacklisted(address indexed user, bool isBlacklisted);
}
