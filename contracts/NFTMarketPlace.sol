// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {Helpers} from "contracts/libraries/Helpers.sol";
import {Events} from "contracts/libraries/Events.sol";
import {Types} from "contracts/libraries/Types.sol";

contract NFTMarketplace is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    IERC721Receiver
{
    // State variables
    uint256 public listingCounter;
    mapping(uint256 => Types.Listing) public listings;
    mapping(uint256 => Types.AuctionBid[]) public bids; // track bids for auction listings
    mapping(address => bool) public blacklist;
    uint256 public buyerFeePercent;
    uint256 public sellerFeePercent;
    address public treasury;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _treasury) public initializer {
        treasury = _treasury;
        buyerFeePercent = 25; // 0.25%
        sellerFeePercent = 25; // 0.25%
        __Ownable_init(_msgSender());
        __ReentrancyGuard_init();
    }

    // Modifiers
    modifier onlyNotBlacklisted() {
        require(!blacklist[msg.sender], "You are blacklisted.");
        _;
    }

    modifier onlyExistingListing(uint256 listingId) {
        require(
            listingId <= listingCounter &&
                listings[listingId].seller != address(0),
            "Listing does not exist."
        );
        _;
    }

    // Functions
    function listNFT(
        address nftContract,
        uint256 tokenId,
        uint256 amount, // use 1 for ERC721
        uint256 price,
        address paymentToken,
        Types.SaleType saleType,
        uint256 duration
    ) external onlyNotBlacklisted {
        require(price > 0, "Price must be greater than 0.");
        require(
            saleType == Types.SaleType.FixedPrice || duration > 0,
            "Duration must be greater than 0 for auction."
        );

        listingCounter++;
        uint256 listingId = listingCounter;

        listings[listingId] = Types.Listing({
            id: listingId,
            seller: msg.sender,
            nftContract: nftContract,
            tokenId: tokenId,
            amount: amount,
            price: price,
            paymentToken: paymentToken,
            saleType: saleType,
            endTime: saleType == Types.SaleType.Auction
                ? block.timestamp + duration
                : 0,
            isSold: false
        });

        if (Helpers.isERC721(nftContract)) {
            require(amount == 1, "Amount must be 1 for ERC721.");
            IERC721(nftContract).transferFrom(
                msg.sender,
                address(this),
                tokenId
            );
        } else if (Helpers.isERC1155(nftContract)) {
            IERC1155(nftContract).safeTransferFrom(
                msg.sender,
                address(this),
                tokenId,
                amount,
                ""
            );
        } else {
            revert("Unsupported NFT standard.");
        }

        emit Events.NFTListed(
            listingId,
            msg.sender,
            nftContract,
            tokenId,
            amount,
            price,
            paymentToken,
            saleType,
            listings[listingId].endTime
        );
    }

    function buyNFT(
        uint256 listingId
    ) external payable onlyExistingListing(listingId) onlyNotBlacklisted {
        Types.Listing storage listing = listings[listingId];
        require(
            listing.saleType == Types.SaleType.FixedPrice,
            "Not a fixed price listing."
        );
        require(!listing.isSold, "NFT already sold.");

        uint256 totalPrice = listing.price;
        uint256 buyerFee = (totalPrice * buyerFeePercent) / 10000;
        uint256 sellerProceeds = totalPrice -
            buyerFee -
            ((totalPrice * sellerFeePercent) / 10000);

        if (listing.paymentToken == address(0)) {
            // Payment in ETH
            require(
                msg.value == totalPrice + buyerFee,
                "Incorrect ETH amount sent."
            );
            payable(listing.seller).transfer(sellerProceeds);
            payable(treasury).transfer(
                buyerFee + ((totalPrice * sellerFeePercent) / 10000)
            );
        } else {
            // Payment in ERC20
            IERC20 token = IERC20(listing.paymentToken);
            token.transferFrom(msg.sender, listing.seller, sellerProceeds);
            token.transferFrom(
                msg.sender,
                treasury,
                buyerFee + ((totalPrice * sellerFeePercent) / 10000)
            );
        }

        listing.isSold = true;
        _transferNFT(
            listing.nftContract,
            address(this),
            msg.sender,
            listing.tokenId,
            listing.amount
        );

        emit Events.NFTPurchased(listingId, msg.sender);
    }

    function placeBid(
        uint256 listingId,
        uint256 bidAmount
    ) external payable onlyExistingListing(listingId) onlyNotBlacklisted {
        Types.Listing storage listing = listings[listingId];
        require(
            listing.saleType == Types.SaleType.Auction,
            "Not an auction listing."
        );
        require(block.timestamp < listing.endTime, "Auction has ended.");

        Types.AuctionBid[] storage auctionBids = bids[listingId];

        if (listing.paymentToken == address(0)) {
            // Bidding with ETH
            uint256 currentBidAmount = msg.value;
            require(
                currentBidAmount > 0,
                "ETH bid amount must be greater than zero."
            );

            if (auctionBids.length > 0) {
                require(
                    currentBidAmount >
                        auctionBids[auctionBids.length - 1].bidAmount,
                    "Bid must be higher than the current highest bid."
                );
                uint256 minIncrement = (auctionBids[auctionBids.length - 1]
                    .bidAmount * 101) / 100; // minimum increment is 1% of current bid
                require(
                    currentBidAmount >= minIncrement,
                    "Bid increment too small."
                );
            } else {
                require(
                    currentBidAmount >= listing.price,
                    "Bid must be at least the starting price."
                );
            }

            auctionBids.push(
                Types.AuctionBid({
                    bidder: msg.sender,
                    bidAmount: currentBidAmount
                })
            );
        } else {
            // Bidding with ERC20 token
            IERC20 paymentToken = IERC20(listing.paymentToken);
            require(
                bidAmount > 0,
                "ERC20 bid amount must be greater than zero."
            );

            if (auctionBids.length > 0) {
                require(
                    bidAmount > auctionBids[auctionBids.length - 1].bidAmount,
                    "Bid must be higher than the current highest bid."
                );
                uint256 minIncrement = (auctionBids[auctionBids.length - 1]
                    .bidAmount * 101) / 100; // minimum increment is 1% of current bid
                require(bidAmount >= minIncrement, "Bid increment too small.");
            } else {
                require(
                    bidAmount >= listing.price,
                    "Bid must be at least the starting price."
                );
            }

            // Check the token allowance for ERC20
            require(
                paymentToken.allowance(msg.sender, address(this)) >= bidAmount,
                "Insufficient token allowance."
            );

            // Transfer the ERC20 token from the bidder to the contract
            paymentToken.transferFrom(msg.sender, address(this), bidAmount);

            auctionBids.push(
                Types.AuctionBid({bidder: msg.sender, bidAmount: bidAmount})
            );
        }

        emit Events.BidPlaced(
            listingId,
            msg.sender,
            listing.paymentToken == address(0) ? msg.value : bidAmount
        );
    }

    function finalizeAuction(
        uint256 listingId
    ) external onlyExistingListing(listingId) {
        Types.Listing storage listing = listings[listingId];
        require(
            listing.saleType == Types.SaleType.Auction,
            "Not an auction listing."
        );
        require(
            block.timestamp >= listing.endTime,
            "Auction has not ended yet."
        );
        require(!listing.isSold, "NFT already sold.");

        Types.AuctionBid[] storage auctionBids = bids[listingId];
        require(auctionBids.length > 0, "No bids placed.");

        Types.AuctionBid memory highestBid = auctionBids[
            auctionBids.length - 1
        ];
        uint256 sellerProceeds = highestBid.bidAmount -
            ((highestBid.bidAmount * buyerFeePercent) / 10000) -
            ((highestBid.bidAmount * sellerFeePercent) / 10000);

        listing.isSold = true;
        payable(listing.seller).transfer(sellerProceeds);
        payable(treasury).transfer(
            (highestBid.bidAmount * buyerFeePercent) /
                10000 +
                (highestBid.bidAmount * sellerFeePercent) /
                10000
        );

        _transferNFT(
            listing.nftContract,
            address(this),
            highestBid.bidder,
            listing.tokenId,
            listing.amount
        );

        emit Events.AuctionFinalized(
            listingId,
            highestBid.bidder,
            highestBid.bidAmount
        );
    }

    function withdrawNFT(
        uint256 listingId
    ) external onlyExistingListing(listingId) {
        Types.Listing storage listing = listings[listingId];
        require(
            listing.seller == msg.sender,
            "Only the seller can withdraw the NFT."
        );
        require(!listing.isSold, "NFT already sold.");

        if (listing.saleType == Types.SaleType.FixedPrice) {
            _withdrawFixedPrice(listingId);
        } else if (listing.saleType == Types.SaleType.Auction) {
            _withdrawAuction(listingId);
        }
    }

    function blacklistUser(address user, bool status) external onlyOwner {
        blacklist[user] = status;
        emit Events.Blacklisted(user, status);
    }

    function setBuyerFeePercent(uint256 _buyerFeePercent) external onlyOwner {
        buyerFeePercent = _buyerFeePercent;
    }

    function setSellerFeePercent(uint256 _sellerFeePercent) external onlyOwner {
        sellerFeePercent = _sellerFeePercent;
    }

    function _withdrawFixedPrice(uint256 listingId) internal {
        Types.Listing storage listing = listings[listingId];
        require(!listing.isSold, "NFT already sold.");
        _transferNFT(
            listing.nftContract,
            address(this),
            listing.seller,
            listing.tokenId,
            listing.amount
        );
        delete listings[listingId];
        emit Events.NFTWithdrawn(listingId, listing.seller);
    }

    function _withdrawAuction(uint256 listingId) internal {
        Types.Listing storage listing = listings[listingId];
        require(
            block.timestamp < listing.endTime,
            "Cannot withdraw after auction end time."
        );
        require(
            bids[listingId].length == 0,
            "Cannot withdraw NFT after a bid has been placed."
        );
        _transferNFT(
            listing.nftContract,
            address(this),
            listing.seller,
            listing.tokenId,
            listing.amount
        );
        delete listings[listingId];
        emit Events.NFTWithdrawn(listingId, listing.seller);
    }

    function _transferNFT(
        address nftContract,
        address from,
        address to,
        uint256 tokenId,
        uint256 amount
    ) internal {
        if (Helpers.isERC721(nftContract)) {
            IERC721(nftContract).transferFrom(from, to, tokenId);
        } else if (Helpers.isERC1155(nftContract)) {
            IERC1155(nftContract).safeTransferFrom(
                from,
                to,
                tokenId,
                amount,
                ""
            );
        } else {
            revert("Unsupported NFT standard.");
        }
    }

    receive() external payable {}

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
