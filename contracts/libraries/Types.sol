// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library Types {
    // Listing types
    enum SaleType {
        FixedPrice,
        Auction
    }

    struct Listing {
        uint256 id;
        address seller;
        address nftContract;
        uint256 tokenId;
        uint256 amount; // used for ERC1155
        uint256 price; // fixed price or starting price for auction
        address paymentToken; // address(0) for ETH, or ERC20 token address
        SaleType saleType;
        uint256 endTime; // for auction
        bool isSold;
    }

    struct AuctionBid {
        address bidder;
        uint256 bidAmount;
    }
}
