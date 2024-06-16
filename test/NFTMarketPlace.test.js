const {
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");

const { ethers, upgrades } = require("hardhat");

describe("NFTMarketPlace", function () {
  const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";
  async function deployNFTMarketPlace() {
    // Contracts are deployed using the first signer/account by default
    const [tokenHolder, nft721Holder, nft1155Holder, treasury, nftBuyer] =
      await ethers.getSigners();

    // Deploy MyToken contract
    const MyToken = await ethers.getContractFactory("MyToken");
    const myTokenContract = await MyToken.deploy("MyToken", "MTK", 3000000);

    // Deploy MyNFT721 contract
    const MyNFT721 = await ethers.getContractFactory("MyNFT721");
    const myNFT721Contract = await MyNFT721.deploy();

    // Deploy MyNFT1155 contract
    const MyNFT1155 = await ethers.getContractFactory("MyNFT1155");
    const myNFT1155Contract = await MyNFT1155.deploy();

    // Mint NFTs
    await myNFT721Contract.mint(nft721Holder.address, 1);
    await myNFT1155Contract.mint(nft1155Holder.address, 1, 100, "0x");

    // Deploy the NFTMarketplace contract
    const NFTMarketplace = await ethers.getContractFactory("NFTMarketplace");
    const nftMarketplaceContract = await upgrades.deployProxy(
      NFTMarketplace,
      [treasury.address],
      { initializer: "initialize" }
    );

    return {
      tokenHolder,
      nft721Holder,
      nft1155Holder,
      treasury,
      myTokenContract,
      myNFT721Contract,
      myNFT1155Contract,
      nftMarketplaceContract,
      nftBuyer,
    };
  }

  describe("Deployment", function () {
    it("Should set the right info for market place", async function () {
      const { nftMarketplaceContract, treasury } = await loadFixture(
        deployNFTMarketPlace
      );

      expect(await nftMarketplaceContract.listingCounter()).to.equal(0);
      expect(await nftMarketplaceContract.buyerFeePercent()).to.equal(25);
      expect(await nftMarketplaceContract.sellerFeePercent()).to.equal(25);
      expect(await nftMarketplaceContract.treasury()).to.equal(
        treasury.address
      );
    });
  });

  describe("listNFT", function () {
    it("Should list an ERC721 token successfully", async function () {
      const {
        nftMarketplaceContract,
        myNFT721Contract,
        nft721Holder,
        myTokenContract,
      } = await loadFixture(deployNFTMarketPlace);

      // Approve the marketplace to transfer the ERC721 token from the nft721Holder
      await myNFT721Contract
        .connect(nft721Holder)
        .approve(nftMarketplaceContract.target, 1);

      // List the ERC721 token on the marketplace
      await expect(
        nftMarketplaceContract
          .connect(nft721Holder)
          .listNFT(
            myNFT721Contract.target,
            1,
            1,
            100,
            myTokenContract.target,
            0,
            0
          )
      )
        .to.emit(nftMarketplaceContract, "NFTListed")
        .withArgs(
          1, // listingId
          nft721Holder.address, // seller
          myNFT721Contract.target, // nftContract
          1, // tokenId
          1, // amount
          100, // price
          myTokenContract.target, // paymentToken
          0, // saleType (FixedPrice)
          0 // endTime (0 for fixed price)
        );

      // Check that the NFT has been transferred to the marketplace contract
      expect(await myNFT721Contract.ownerOf(1)).to.equal(
        nftMarketplaceContract.target
      );
    });

    // it("Should list an ERC1155 token successfully", async function () {
    //   const { nftMarketplaceContract, myNFT1155Contract, nft1155Holder } =
    //     await loadFixture(deployNFTMarketPlace);

    //   // Approve the marketplace to transfer the ERC1155 token from the nft1155Holder
    //   await myNFT1155Contract
    //     .connect(nft1155Holder)
    //     .setApprovalForAll(nftMarketplaceContract.target, true);

    //   // List the ERC1155 token on the marketplace
    //   await expect(
    //     nftMarketplaceContract.connect(nft1155Holder).listNFT(
    //       myNFT1155Contract.target, // nftContract
    //       1, // tokenId
    //       10, // amount
    //       ethers.parseEther("1"), // price
    //       ADDRESS_ZERO, // paymentToken (native currency)
    //       0, // SaleType.FixedPrice
    //       0 // duration (irrelevant for fixed price)
    //     )
    //   )
    //     .to.emit(nftMarketplaceContract, "NFTListed")
    //     .withArgs(
    //       1, // listingId
    //       nft1155Holder.address, // seller
    //       myNFT1155Contract.target, // nftContract
    //       1, // tokenId
    //       10, // amount
    //       ethers.parseEther("1"), // price
    //       ADDRESS_ZERO, // paymentToken
    //       0, // saleType (FixedPrice)
    //       0 // endTime (0 for fixed price)
    //     );

    //   // Check that the NFT has been transferred to the marketplace contract
    //   expect(
    //     await myNFT1155Contract.balanceOf(nftMarketplaceContract.target, 1)
    //   ).to.equal(10);
    // });

    it("Should fail if price is zero", async function () {
      const { nftMarketplaceContract, myNFT721Contract, nft721Holder } =
        await loadFixture(deployNFTMarketPlace);

      await expect(
        nftMarketplaceContract.connect(nft721Holder).listNFT(
          myNFT721Contract.target, // nftContract
          1, // tokenId
          1, // amount
          0, // price
          ADDRESS_ZERO, // paymentToken
          0, // SaleType.FixedPrice
          0 // duration
        )
      ).to.be.revertedWith("Price must be greater than 0.");
    });

    it("Should fail if auction duration is zero", async function () {
      const { nftMarketplaceContract, myNFT721Contract, nft721Holder } =
        await loadFixture(deployNFTMarketPlace);

      await expect(
        nftMarketplaceContract.connect(nft721Holder).listNFT(
          myNFT721Contract.target, // nftContract
          1, // tokenId
          1, // amount
          ethers.parseEther("1"), // price
          ADDRESS_ZERO, // paymentToken
          1, // SaleType.Auction
          0 // duration
        )
      ).to.be.revertedWith("Duration must be greater than 0 for auction.");
    });

    it("Should fail if amount is not 1 for ERC721", async function () {
      const { nftMarketplaceContract, myNFT721Contract, nft721Holder } =
        await loadFixture(deployNFTMarketPlace);

      await expect(
        nftMarketplaceContract.connect(nft721Holder).listNFT(
          myNFT721Contract.target, // nftContract
          1, // tokenId
          2, // amount
          ethers.parseEther("1"), // price
          ADDRESS_ZERO, // paymentToken
          0, // SaleType.FixedPrice
          0 // duration
        )
      ).to.be.revertedWith("Amount must be 1 for ERC721.");
    });

    it("Should fail if NFT standard is unsupported", async function () {
      const { nftMarketplaceContract, tokenHolder, myTokenContract } =
        await loadFixture(deployNFTMarketPlace);

      // Simulate an unsupported NFT standard by using an arbitrary address
      await expect(
        nftMarketplaceContract.connect(tokenHolder).listNFT(
          myTokenContract.target, // nftContract (arbitrary address, not a valid ERC721 or ERC1155)
          1, // tokenId
          1, // amount
          ethers.parseEther("1"), // price
          ADDRESS_ZERO, // paymentToken
          0, // SaleType.FixedPrice
          0 // duration
        )
      ).to.be.revertedWith("Unsupported NFT standard.");
    });

    it("Should list an ERC721 token successfully for Auction", async function () {
      const {
        nftMarketplaceContract,
        myNFT721Contract,
        nft721Holder,
        myTokenContract,
      } = await loadFixture(deployNFTMarketPlace);

      // Approve the marketplace to transfer the ERC721 token from the nft721Holder
      await myNFT721Contract
        .connect(nft721Holder)
        .approve(nftMarketplaceContract.target, 1);

      // List the ERC721 token on the marketplace for Auction
      const duration = 60 * 60 * 24; // 1 day

      const currentTimestamp = (await ethers.provider.getBlock("latest"))
        .timestamp;
      await expect(
        nftMarketplaceContract.connect(nft721Holder).listNFT(
          myNFT721Contract.target, // nftContract
          1, // tokenId
          1, // amount (should be 1 for ERC721)
          ethers.parseEther("1"), // starting price
          myTokenContract.target, // paymentToken
          1, // SaleType.Auction
          duration // duration
        )
      )
        .to.emit(nftMarketplaceContract, "NFTListed")
        .withArgs(
          1, // listingId
          nft721Holder.address, // seller
          myNFT721Contract.target, // nftContract
          1, // tokenId
          1, // amount
          ethers.parseEther("1"), // price
          myTokenContract.target, // paymentToken
          1, // saleType (Auction)
          currentTimestamp + duration + 1 // endTime
        );

      // Check that the NFT has been transferred to the marketplace contract
      expect(await myNFT721Contract.ownerOf(1)).to.equal(
        nftMarketplaceContract.target
      );
    });
  });

  describe("buyNFT", function () {
    it("Should buy an ERC721 NFT with ETH successfully", async function () {
      const {
        nftMarketplaceContract,
        myNFT721Contract,
        nft721Holder,
        nftBuyer,
        treasury,
      } = await loadFixture(deployNFTMarketPlace);

      // Approve and list NFT
      await myNFT721Contract
        .connect(nft721Holder)
        .approve(nftMarketplaceContract.target, 1);
      await nftMarketplaceContract.connect(nft721Holder).listNFT(
        myNFT721Contract.target, // nftContract
        1, // tokenId
        1, // amount (must be 1 for ERC721)
        ethers.parseEther("1"), // price in ETH
        ADDRESS_ZERO, // Payment token (native currency, ETH)
        0, // SaleType (FixedPrice)
        0 // duration (irrelevant for fixed price)
      );

      // Get the listing ID
      const listingId = 1;

      // Calculate the buyer fee
      const totalPrice = ethers.parseEther("1");
      const buyerFeePercent = await nftMarketplaceContract.buyerFeePercent();
      const buyerFee = (totalPrice * BigInt(buyerFeePercent)) / BigInt(10000);
      const totalCost = totalPrice + buyerFee;

      // Buy NFT with ETH
      await expect(
        nftMarketplaceContract
          .connect(nftBuyer)
          .buyNFT(listingId, { value: totalCost })
      )
        .to.emit(nftMarketplaceContract, "NFTPurchased")
        .withArgs(
          listingId, // listingId
          nftBuyer.address // buyer
        );

      // Check the NFT ownership transfer
      expect(await myNFT721Contract.ownerOf(1)).to.equal(nftBuyer.address);
    });

    it("Should buy an ERC721 NFT with ERC20 token successfully", async function () {
      const {
        nftMarketplaceContract,
        myNFT721Contract,
        nft721Holder,
        tokenHolder,
        myTokenContract,
        treasury,
      } = await loadFixture(deployNFTMarketPlace);

      // Mint and approve ERC20 tokens for the buyer
      const totalPrice = BigInt(100);
      await myTokenContract
        .connect(tokenHolder)
        .approve(nftMarketplaceContract.target, totalPrice);

      // Approve and list NFT
      await myNFT721Contract
        .connect(nft721Holder)
        .approve(nftMarketplaceContract.target, 1);
      await nftMarketplaceContract.connect(nft721Holder).listNFT(
        myNFT721Contract.target, // nftContract
        1, // tokenId
        1, // amount (must be 1 for ERC721)
        totalPrice, // price in ERC20
        myTokenContract.target, // Payment token (ERC20)
        0, // SaleType (FixedPrice)
        0 // duration (irrelevant for fixed price)
      );

      // Get the listing ID
      const listingId = 1;

      // Calculate the fees
      const buyerFeePercent = await nftMarketplaceContract.buyerFeePercent();
      const buyerFee = (totalPrice * BigInt(buyerFeePercent)) / BigInt(10000);
      const sellerFeePercent = await nftMarketplaceContract.sellerFeePercent();

      const sellerProceeds =
        totalPrice - (totalPrice * BigInt(sellerFeePercent)) / BigInt(10000);

      // Buy NFT with ERC20 token
      await expect(
        nftMarketplaceContract.connect(tokenHolder).buyNFT(listingId)
      )
        .to.emit(nftMarketplaceContract, "NFTPurchased")
        .withArgs(
          listingId, // listingId
          tokenHolder.address // buyer
        );

      // Check the NFT ownership transfer
      expect(await myNFT721Contract.ownerOf(1)).to.equal(tokenHolder.address);
    });

    it("Should fail if the listing is not a fixed price sale", async function () {
      const {
        nftMarketplaceContract,
        myNFT721Contract,
        nft721Holder,
        nftBuyer,
      } = await loadFixture(deployNFTMarketPlace);

      // Approve and list NFT for auction
      await myNFT721Contract
        .connect(nft721Holder)
        .approve(nftMarketplaceContract.target, 1);
      await nftMarketplaceContract.connect(nft721Holder).listNFT(
        myNFT721Contract.target, // nftContract
        1, // tokenId
        1, // amount (must be 1 for ERC721)
        ethers.parseEther("1"), // price in ETH
        ADDRESS_ZERO, // Payment token (native currency, ETH)
        1, // SaleType (Auction)
        3600 // duration in seconds (1 hour)
      );

      // Get the listing ID
      const listingId = 1;

      // Try to buy the NFT, should revert
      await expect(
        nftMarketplaceContract
          .connect(nftBuyer)
          .buyNFT(listingId, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("Not a fixed price listing.");
    });

    it("Should fail if NFT is already sold", async function () {
      const {
        nftMarketplaceContract,
        myNFT721Contract,
        nft721Holder,
        nftBuyer,
      } = await loadFixture(deployNFTMarketPlace);

      // Approve and list NFT
      await myNFT721Contract
        .connect(nft721Holder)
        .approve(nftMarketplaceContract.target, 1);
      await nftMarketplaceContract.connect(nft721Holder).listNFT(
        myNFT721Contract.target, // nftContract
        1, // tokenId
        1, // amount (must be 1 for ERC721)
        ethers.parseEther("1"), // price in ETH
        ADDRESS_ZERO, // Payment token (native currency, ETH)
        0, // SaleType (FixedPrice)
        0 // duration (irrelevant for fixed price)
      );

      // Get the listing ID
      const listingId = 1;

      // Calculate the buyer fee
      const totalPrice = ethers.parseEther("1");
      const buyerFeePercent = await nftMarketplaceContract.buyerFeePercent();
      const buyerFee = (totalPrice * BigInt(buyerFeePercent)) / BigInt(10000);
      const totalCost = totalPrice + buyerFee;

      // Buy NFT with ETH
      await nftMarketplaceContract
        .connect(nftBuyer)
        .buyNFT(listingId, { value: totalCost });

      // Try to buy the NFT again, should revert
      await expect(
        nftMarketplaceContract
          .connect(nftBuyer)
          .buyNFT(listingId, { value: totalCost })
      ).to.be.revertedWith("NFT already sold.");
    });

    it("Should fail if incorrect ETH amount is sent", async function () {
      const {
        nftMarketplaceContract,
        myNFT721Contract,
        nft721Holder,
        nftBuyer,
      } = await loadFixture(deployNFTMarketPlace);

      // Approve and list NFT
      await myNFT721Contract
        .connect(nft721Holder)
        .approve(nftMarketplaceContract.target, 1);
      await nftMarketplaceContract.connect(nft721Holder).listNFT(
        myNFT721Contract.target, // nftContract
        1, // tokenId
        1, // amount (must be 1 for ERC721)
        ethers.parseEther("1"), // price in ETH
        ADDRESS_ZERO, // Payment token (native currency, ETH)
        0, // SaleType (FixedPrice)
        0 // duration (irrelevant for fixed price)
      );

      // Get the listing ID
      const listingId = 1;

      // Try to buy the NFT with incorrect ETH amount, should revert
      const incorrectValue = ethers.parseEther("0.9");
      await expect(
        nftMarketplaceContract
          .connect(nftBuyer)
          .buyNFT(listingId, { value: incorrectValue })
      ).to.be.revertedWith("Incorrect ETH amount sent.");
    });

    it("Should handle fee transfers correctly when buying with ETH", async function () {
      const {
        nftMarketplaceContract,
        myNFT721Contract,
        nft721Holder,
        nftBuyer,
        treasury,
      } = await loadFixture(deployNFTMarketPlace);

      // Approve and list NFT
      await myNFT721Contract
        .connect(nft721Holder)
        .approve(nftMarketplaceContract.target, 1);
      await nftMarketplaceContract.connect(nft721Holder).listNFT(
        myNFT721Contract.target, // nftContract
        1, // tokenId
        1, // amount (must be 1 for ERC721)
        ethers.parseEther("1"), // price in ETH
        ADDRESS_ZERO, // Payment token (native currency, ETH)
        0, // SaleType (FixedPrice)
        0 // duration (irrelevant for fixed price)
      );

      // Get the listing ID
      const listingId = 1;

      // Calculate the buyer fee and total cost
      const totalPrice = ethers.parseEther("1");
      const buyerFeePercent = await nftMarketplaceContract.buyerFeePercent();
      const buyerFee = (totalPrice * BigInt(buyerFeePercent)) / BigInt(10000);
      const totalCost = totalPrice + BigInt(buyerFee);

      // Buy NFT with ETH
      await nftMarketplaceContract
        .connect(nftBuyer)
        .buyNFT(listingId, { value: totalCost });
    });

    it("Should handle fee transfers correctly when buying with ERC20 token", async function () {
      const {
        nftMarketplaceContract,
        myNFT721Contract,
        nft721Holder,
        myTokenContract,
        tokenHolder,
        treasury,
      } = await loadFixture(deployNFTMarketPlace);

      // Mint and approve ERC20 tokens for the buyer
      const totalPrice = BigInt(100);
      await myTokenContract
        .connect(tokenHolder)
        .approve(nftMarketplaceContract.target, totalPrice);

      // Approve and list NFT
      await myNFT721Contract
        .connect(nft721Holder)
        .approve(nftMarketplaceContract.target, 1);
      await nftMarketplaceContract.connect(nft721Holder).listNFT(
        myNFT721Contract.target, // nftContract
        1, // tokenId
        1, // amount (must be 1 for ERC721)
        totalPrice, // price in ERC20
        myTokenContract.target, // Payment token (ERC20)
        0, // SaleType (FixedPrice)
        0 // duration (irrelevant for fixed price)
      );

      // Get the listing ID
      const listingId = 1;

      // Calculate the fees
      const buyerFeePercent = await nftMarketplaceContract.buyerFeePercent();
      const buyerFee = (totalPrice * BigInt(buyerFeePercent)) / BigInt(10000);
      const sellerProceeds =
        totalPrice -
        (totalPrice * BigInt(await nftMarketplaceContract.sellerFeePercent())) /
          BigInt(10000);

      // Buy NFT with ERC20 token
      await nftMarketplaceContract.connect(tokenHolder).buyNFT(listingId);
    });

    it("Should revert if attempting to buy an already sold NFT", async function () {
      const {
        nftMarketplaceContract,
        myNFT721Contract,
        nft721Holder,
        nftBuyer,
      } = await loadFixture(deployNFTMarketPlace);

      // Approve and list NFT
      await myNFT721Contract
        .connect(nft721Holder)
        .approve(nftMarketplaceContract.target, 1);
      await nftMarketplaceContract.connect(nft721Holder).listNFT(
        myNFT721Contract.target, // nftContract
        1, // tokenId
        1, // amount (must be 1 for ERC721)
        ethers.parseEther("1"), // price in ETH
        ADDRESS_ZERO, // Payment token (native currency, ETH)
        0, // SaleType (FixedPrice)
        0 // duration (irrelevant for fixed price)
      );

      // Get the listing ID
      const listingId = 1;

      // Calculate the buyer fee
      const totalPrice = ethers.parseEther("1");
      const buyerFeePercent = await nftMarketplaceContract.buyerFeePercent();
      const buyerFee = (totalPrice * BigInt(buyerFeePercent)) / BigInt(10000);
      const totalCost = totalPrice + buyerFee;

      // Buy NFT with ETH
      await nftMarketplaceContract
        .connect(nftBuyer)
        .buyNFT(listingId, { value: totalCost });

      // Attempt to buy the NFT again, should revert
      await expect(
        nftMarketplaceContract
          .connect(nftBuyer)
          .buyNFT(listingId, { value: totalCost })
      ).to.be.revertedWith("NFT already sold.");
    });

    it("Should revert if incorrect ETH amount is sent", async function () {
      const {
        nftMarketplaceContract,
        myNFT721Contract,
        nft721Holder,
        nftBuyer,
      } = await loadFixture(deployNFTMarketPlace);

      // Approve and list NFT
      await myNFT721Contract
        .connect(nft721Holder)
        .approve(nftMarketplaceContract.target, 1);
      await nftMarketplaceContract.connect(nft721Holder).listNFT(
        myNFT721Contract.target, // nftContract
        1, // tokenId
        1, // amount (must be 1 for ERC721)
        ethers.parseEther("1"), // price in ETH
        ADDRESS_ZERO, // Payment token (native currency, ETH)
        0, // SaleType (FixedPrice)
        0 // duration (irrelevant for fixed price)
      );

      // Get the listing ID
      const listingId = 1;

      // Buy NFT with incorrect ETH amount, should revert
      await expect(
        nftMarketplaceContract
          .connect(nftBuyer)
          .buyNFT(listingId, { value: ethers.parseEther("0.9") })
      ).to.be.revertedWith("Incorrect ETH amount sent.");
    });

    it("Should revert if trying to buy a non-existent listing", async function () {
      const { nftMarketplaceContract, nftBuyer } = await loadFixture(
        deployNFTMarketPlace
      );

      // Attempt to buy a non-existent listing, should revert
      await expect(
        nftMarketplaceContract
          .connect(nftBuyer)
          .buyNFT(1, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("Listing does not exist.");
    });

    // it("Should revert if trying to buy a listing with unsupported payment token", async function () {
    //   const {
    //     nftMarketplaceContract,
    //     myNFT721Contract,
    //     nft721Holder,
    //     nftBuyer,
    //     myTokenContract,
    //   } = await loadFixture(deployNFTMarketPlace);

    //   // Approve and list NFT
    //   await myNFT721Contract
    //     .connect(nft721Holder)
    //     .approve(nftMarketplaceContract.target, 1);
    //   await nftMarketplaceContract.connect(nft721Holder).listNFT(
    //     myNFT721Contract.target, // nftContract
    //     1, // tokenId
    //     1, // amount (must be 1 for ERC721)
    //     ethers.parseEther("1"), // price in ETH
    //     myTokenContract.target, // Payment token (ERC20)
    //     0, // SaleType (FixedPrice)
    //     0 // duration (irrelevant for fixed price)
    //   );

    //   // Get the listing ID
    //   const listingId = 1;

    //   // Try to buy the NFT with unsupported payment token, should revert
    //   await expect(
    //     nftMarketplaceContract
    //       .connect(nftBuyer)
    //       .buyNFT(listingId, { value: ethers.parseEther("1") })
    //   ).to.be.revertedWith("Unsupported payment token.");
    // });

    // it("Should revert if trying to buy a listing with incorrect payment token amount", async function () {
    //   const {
    //     nftMarketplaceContract,
    //     myNFT721Contract,
    //     nft721Holder,
    //     nftBuyer,
    //     myTokenContract,
    //   } = await loadFixture(deployNFTMarketPlace);

    //   // Mint and approve ERC20 tokens for the buyer
    //   const totalPrice = ethers.parseEther("1");
    //   await myTokenContract.mint(nftBuyer.address, totalPrice);
    //   await myTokenContract
    //     .connect(nftBuyer)
    //     .approve(nftMarketplaceContract.target, totalPrice);

    //   // Approve and list NFT
    //   await myNFT721Contract
    //     .connect(nft721Holder)
    //     .approve(nftMarketplaceContract.target, 1);
    //   await nftMarketplaceContract.connect(nft721Holder).listNFT(
    //     myNFT721Contract.target, // nftContract
    //     1, // tokenId
    //     1, // amount (must be 1 for ERC721)
    //     totalPrice.add(ethers.utils.parseUnits("0.5", "ether")), // price in ETH (incorrect amount)
    //     myTokenContract.target, // Payment token (ERC20)
    //     0, // SaleType (FixedPrice)
    //     0 // duration (irrelevant for fixed price)
    //   );

    //   // Get the listing ID
    //   const listingId = 1;

    //   // Try to buy the NFT with incorrect payment token amount, should revert
    //   await expect(
    //     nftMarketplaceContract.connect(nftBuyer).buyNFT(listingId)
    //   ).to.be.revertedWith("Incorrect payment token amount.");
    // });
  });

  describe("placeBid", () => {
    it("Should place a bid with ERC20 token successfully", async function () {
      const {
        myTokenContract,
        tokenHolder,
        nftMarketplaceContract,
        myNFT721Contract,
        nft721Holder,
      } = await loadFixture(deployNFTMarketPlace);

      const bidAmountErc20 = 100;
      const listingId = 1;

      // Approve the marketplace to transfer the ERC721 token from the nft721Holder
      await myNFT721Contract
        .connect(nft721Holder)
        .approve(nftMarketplaceContract.target, 1);

      // List the ERC721 token on the marketplace for Auction
      const duration = 60 * 60 * 24; // 1 day

      await nftMarketplaceContract.connect(nft721Holder).listNFT(
        myNFT721Contract.target, // nftContract
        1, // tokenId
        1, // amount (should be 1 for ERC721)
        bidAmountErc20, // starting price
        myTokenContract.target, // paymentToken
        1, // SaleType.Auction
        duration // duration
      );

      await myTokenContract
        .connect(tokenHolder)
        .approve(nftMarketplaceContract.target, bidAmountErc20);

      await nftMarketplaceContract
        .connect(tokenHolder)
        .placeBid(listingId, bidAmountErc20);
    });

    it("Should revert if bidding with ETH amount is zero", async function () {
      const {
        myTokenContract,
        tokenHolder,
        nftMarketplaceContract,
        myNFT721Contract,
        nft721Holder,
      } = await loadFixture(deployNFTMarketPlace);

      const bidAmount = ethers.parseEther("1");
      const listingId = 1;

      // Approve the marketplace to transfer the ERC721 token from the nft721Holder
      await myNFT721Contract
        .connect(nft721Holder)
        .approve(nftMarketplaceContract.target, 1);

      // List the ERC721 token on the marketplace for Auction
      const duration = 60 * 60 * 24; // 1 day
      nftMarketplaceContract.connect(nft721Holder).listNFT(
        myNFT721Contract.target, // nftContract
        1, // tokenId
        1, // amount (should be 1 for ERC721)
        ethers.parseEther("1"), // starting price
        ADDRESS_ZERO, // paymentToken
        1, // SaleType.Auction
        duration // duration
      );
      await myTokenContract
        .connect(tokenHolder)
        .approve(nftMarketplaceContract.target, bidAmount);

      await expect(
        await nftMarketplaceContract
          .connect(tokenHolder)
          .placeBid(listingId, bidAmount, { value: 0 })
      ).to.be.revertedWith("ETH bid amount must be greater than zero.");
    });

    it("Should revert if bidding with ERC20 amount is zero", async function () {
      await expect(
        contractInstance.connect(bidder2).placeBid(listingId, 0)
      ).to.be.revertedWith("ERC20 bid amount must be greater than zero.");
    });

    it("Should revert if bidding with ETH is lower than current highest bid", async function () {
      // Place initial bid
      await contractInstance
        .connect(bidder1)
        .placeBid(listingId, { value: bidAmountEth });

      // Try placing a lower bid
      await expect(
        contractInstance
          .connect(bidder2)
          .placeBid(listingId, { value: ethers.utils.parseEther("0.5") })
      ).to.be.revertedWith("Bid must be higher than the current highest bid.");
    });

    it("Should revert if bidding with ERC20 is lower than current highest bid", async function () {
      // Place initial bid
      await paymentTokenInstance
        .connect(bidder1)
        .approve(contractInstance.address, bidAmountErc20);
      await contractInstance
        .connect(bidder1)
        .placeBid(listingId, bidAmountErc20);

      // Try placing a lower bid
      await paymentTokenInstance
        .connect(bidder2)
        .approve(contractInstance.address, ethers.utils.parseEther("1.5"));
      await expect(
        contractInstance
          .connect(bidder2)
          .placeBid(listingId, ethers.utils.parseEther("1.5"))
      ).to.be.revertedWith("Bid must be higher than the current highest bid.");
    });

    it("Should revert if auction has ended", async function () {
      const {
        myTokenContract,
        tokenHolder,
        nftMarketplaceContract,
        myNFT721Contract,
        nft721Holder,
      } = await loadFixture(deployNFTMarketPlace);

      const bidAmount = ethers.parseEther("1");
      const listingId = 1;

      // Approve the marketplace to transfer the ERC721 token from the nft721Holder
      await myNFT721Contract
        .connect(nft721Holder)
        .approve(nftMarketplaceContract.target, 1);

      // List the ERC721 token on the marketplace for Auction
      const duration = 60 * 60 * 24; // 1 day

      await nftMarketplaceContract.connect(nft721Holder).listNFT(
        myNFT721Contract.target, // nftContract
        1, // tokenId
        1, // amount (should be 1 for ERC721)
        bidAmount, // starting price
        ADDRESS_ZERO, // paymentToken
        1, // SaleType.Auction
        duration // duration
      );

      await myTokenContract
        .connect(tokenHolder)
        .approve(nftMarketplaceContract.target, bidAmount);

      // Advance time to make auction end
      await ethers.provider.send("evm_increaseTime", [3601]); // 1 hour and 1 second

      await expect(
        nftMarketplaceContract
          .connect(tokenHolder)
          .placeBid(listingId, { value: bidAmount })
      ).to.be.revertedWith("Auction has ended.");
    });
  });
  describe("finalizeAuction", function () {
    it("Should finalize an auction successfully", async function () {
      const {
        nftMarketplaceContract,
        myNFT721Contract,
        nft721Holder,
        tokenHolder,
        otherBidder,
      } = await loadFixture(deployNFTMarketPlace);

      const bidAmount1 = ethers.parseEther("1");
      const bidAmount2 = ethers.parseEther("1.5");
      const listingId = 1;
      const duration = 60 * 60 * 24; // 1 day

      // Approve the marketplace to transfer the ERC721 token from the nft721Holder
      await myNFT721Contract
        .connect(nft721Holder)
        .approve(nftMarketplaceContract.target, 1);

      // List the ERC721 token on the marketplace for Auction
      await nftMarketplaceContract.connect(nft721Holder).listNFT(
        myNFT721Contract.target, // nftContract
        1, // tokenId
        1, // amount (should be 1 for ERC721)
        bidAmount1, // starting price
        ADDRESS_ZERO, // paymentToken (ETH)
        1, // SaleType.Auction
        duration // duration
      );

      // Allow otherBidder to bid
      await myNFT721Contract
        .connect(nft721Holder)
        .approve(nftMarketplaceContract.target, 1);

      // Place bids
      await nftMarketplaceContract
        .connect(tokenHolder)
        .placeBid(listingId, bidAmount1);
      await nftMarketplaceContract
        .connect(otherBidder)
        .placeBid(listingId, bidAmount2);

      // Advance time to after auction end time
      await ethers.provider.send("evm_increaseTime", [duration]);
      await ethers.provider.send("evm_mine");

      // Finalize auction
      await nftMarketplaceContract
        .connect(nft721Holder)
        .finalizeAuction(listingId);

      // Check if the NFT is transferred to the highest bidder
      const ownerOfNFT = await myNFT721Contract.ownerOf(1);
      expect(ownerOfNFT).to.equal(otherBidder.address);

      // Check if events emitted correctly
      const auctionFinalizedEvents = await nftMarketplaceContract.queryFilter(
        "AuctionFinalized",
        nftMarketplaceContract.filters.AuctionFinalized(null, null, null)
      );
      expect(auctionFinalizedEvents.length).to.equal(1);
      const auctionFinalizedEvent = auctionFinalizedEvents[0];
      expect(auctionFinalizedEvent.args.listingId).to.equal(listingId);
      expect(auctionFinalizedEvent.args.highestBidder).to.equal(
        otherBidder.address
      );
      expect(auctionFinalizedEvent.args.highestBidAmount).to.equal(bidAmount2);
    });

    it("Should revert if auction has not ended yet", async function () {
      const { nftMarketplaceContract } = await loadFixture(
        deployNFTMarketPlace
      );
      const listingId = 1;
      const duration = 60 * 60 * 24; // 1 day

      // Attempt to finalize auction before it ends
      await expect(
        nftMarketplaceContract.finalizeAuction(listingId)
      ).to.be.revertedWith("Auction has not ended yet.");
    });

    it("Should revert if no bids were placed", async function () {
      const { nftMarketplaceContract, myNFT721Contract, nft721Holder } =
        await loadFixture(deployNFTMarketPlace);

      const listingId = 1;
      const duration = 60 * 60 * 24; // 1 day

      // Approve the marketplace to transfer the ERC721 token from the nft721Holder
      await myNFT721Contract
        .connect(nft721Holder)
        .approve(nftMarketplaceContract.target, 1);

      // List the ERC721 token on the marketplace for Auction
      await nftMarketplaceContract.connect(nft721Holder).listNFT(
        myNFT721Contract.target, // nftContract
        1, // tokenId
        1, // amount (should be 1 for ERC721)
        ethers.utils.parseEther("1"), // starting price
        ethers.constants.AddressZero, // paymentToken (ETH)
        1, // SaleType.Auction
        duration // duration
      );

      // Advance time to after auction end time
      await ethers.provider.send("evm_increaseTime", [duration]);
      await ethers.provider.send("evm_mine");

      // Attempt to finalize auction with no bids placed
      await expect(
        nftMarketplaceContract.connect(nft721Holder).finalizeAuction(listingId)
      ).to.be.revertedWith("No bids placed.");
    });
  });

  describe("withdrawNFT", function () {
    it("Should withdraw NFT successfully from a Fixed Price listing", async function () {
      const { nftMarketplaceContract, myNFT721Contract, nft721Holder, buyer } =
        await loadFixture(deployNFTMarketPlace);

      const listingId = 1;
      const price = ethers.utils.parseEther("1");

      // List the ERC721 token on the marketplace for Fixed Price
      await myNFT721Contract
        .connect(nft721Holder)
        .approve(nftMarketplaceContract.target, 1);
      await nftMarketplaceContract.connect(nft721Holder).listNFT(
        myNFT721Contract.target, // nftContract
        1, // tokenId
        1, // amount (should be 1 for ERC721)
        price, // price
        ethers.constants.AddressZero, // paymentToken (ETH)
        0, // SaleType.FixedPrice
        0 // duration (irrelevant for fixed price)
      );

      // Purchase the NFT
      await nftMarketplaceContract
        .connect(buyer)
        .buyNFT(listingId, { value: price });

      // Ensure the NFT is no longer owned by the marketplace contract
      let ownerOfNFT = await myNFT721Contract.ownerOf(1);
      expect(ownerOfNFT).to.equal(buyer.address);

      // Withdraw the NFT back from the marketplace contract
      await nftMarketplaceContract.connect(nft721Holder).withdrawNFT(listingId);

      // Ensure the NFT is back with the seller
      ownerOfNFT = await myNFT721Contract.ownerOf(1);
      expect(ownerOfNFT).to.equal(nft721Holder.address);
    });

    it("Should withdraw NFT successfully from an Auction listing", async function () {
      const {
        nftMarketplaceContract,
        myNFT721Contract,
        nft721Holder,
        tokenHolder,
        otherBidder,
      } = await loadFixture(deployNFTMarketPlace);

      const bidAmount1 = ethers.utils.parseEther("1");
      const bidAmount2 = ethers.utils.parseEther("1.5");
      const listingId = 1;
      const duration = 60 * 60 * 24; // 1 day

      // Approve the marketplace to transfer the ERC721 token from the nft721Holder
      await myNFT721Contract
        .connect(nft721Holder)
        .approve(nftMarketplaceContract.target, 1);

      // List the ERC721 token on the marketplace for Auction
      await nftMarketplaceContract.connect(nft721Holder).listNFT(
        myNFT721Contract.target, // nftContract
        1, // tokenId
        1, // amount (should be 1 for ERC721)
        bidAmount1, // starting price
        ethers.constants.AddressZero, // paymentToken (ETH)
        1, // SaleType.Auction
        duration // duration
      );

      // Allow otherBidder to bid
      await myNFT721Contract
        .connect(nft721Holder)
        .approve(nftMarketplaceContract.target, 1);

      // Place bids
      await nftMarketplaceContract
        .connect(tokenHolder)
        .placeBid(listingId, bidAmount1);
      await nftMarketplaceContract
        .connect(otherBidder)
        .placeBid(listingId, bidAmount2);

      // Advance time to after auction end time
      await ethers.provider.send("evm_increaseTime", [duration]);
      await ethers.provider.send("evm_mine");

      // Finalize auction
      await nftMarketplaceContract
        .connect(nft721Holder)
        .finalizeAuction(listingId);

      // Ensure the NFT is no longer owned by the marketplace contract
      let ownerOfNFT = await myNFT721Contract.ownerOf(1);
      expect(ownerOfNFT).to.equal(otherBidder.address);

      // Withdraw the NFT back from the marketplace contract
      await nftMarketplaceContract.connect(nft721Holder).withdrawNFT(listingId);

      // Ensure the NFT is back with the seller
      ownerOfNFT = await myNFT721Contract.ownerOf(1);
      expect(ownerOfNFT).to.equal(nft721Holder.address);
    });

    it("Should revert if called by a non-seller", async function () {
      const {
        nftMarketplaceContract,
        myNFT721Contract,
        nft721Holder,
        tokenHolder,
      } = await loadFixture(deployNFTMarketPlace);

      const listingId = 1;
      const price = ethers.utils.parseEther("1");

      // List the ERC721 token on the marketplace for Fixed Price
      await myNFT721Contract
        .connect(nft721Holder)
        .approve(nftMarketplaceContract.target, 1);
      await nftMarketplaceContract.connect(nft721Holder).listNFT(
        myNFT721Contract.target, // nftContract
        1, // tokenId
        1, // amount (should be 1 for ERC721)
        price, // price
        ethers.constants.AddressZero, // paymentToken (ETH)
        0, // SaleType.FixedPrice
        0 // duration (irrelevant for fixed price)
      );

      // Attempt to withdraw the NFT by a non-seller
      await expect(
        nftMarketplaceContract.connect(tokenHolder).withdrawNFT(listingId)
      ).to.be.revertedWith("Only the seller can withdraw the NFT.");

      // Ensure the NFT is still with the marketplace contract
      const ownerOfNFT = await myNFT721Contract.ownerOf(1);
      expect(ownerOfNFT).to.equal(nftMarketplaceContract.address);
    });

    it("Should revert if NFT is already sold", async function () {
      const { nftMarketplaceContract, myNFT721Contract, nft721Holder, buyer } =
        await loadFixture(deployNFTMarketPlace);

      const listingId = 1;
      const price = ethers.utils.parseEther("1");

      // List the ERC721 token on the marketplace for Fixed Price
      await myNFT721Contract
        .connect(nft721Holder)
        .approve(nftMarketplaceContract.target, 1);
      await nftMarketplaceContract.connect(nft721Holder).listNFT(
        myNFT721Contract.target, // nftContract
        1, // tokenId
        1, // amount (should be 1 for ERC721)
        price, // price
        ethers.constants.AddressZero, // paymentToken (ETH)
        0, // SaleType.FixedPrice
        0 // duration (irrelevant for fixed price)
      );

      // Purchase the NFT
      await nftMarketplaceContract
        .connect(buyer)
        .buyNFT(listingId, { value: price });

      // Attempt to withdraw the NFT after it's sold
      await expect(
        nftMarketplaceContract.connect(nft721Holder).withdrawNFT(listingId)
      ).to.be.revertedWith("NFT already sold.");

      // Ensure the NFT is no longer with the seller
      const ownerOfNFT = await myNFT721Contract.ownerOf(1);
      expect(ownerOfNFT).to.equal(buyer.address);
    });
  });

  describe("blacklistUser", () => {
    it("Should blacklist a user", async function () {
      const { nftMarketplaceContract, nft1155Holder } = await loadFixture(
        deployNFTMarketPlace
      );
      await nftMarketplaceContract.blacklistUser(nft1155Holder.address, true);

      const isBlacklisted = await nftMarketplaceContract.blacklist(
        nft1155Holder.address
      );

      expect(isBlacklisted).to.be.true;
    });
  });

  describe("setBuyerFeePercent", () => {
    it("Should set buyer fee percent", async function () {
      const { nftMarketplaceContract } = await loadFixture(
        deployNFTMarketPlace
      );
      const newBuyerFeePercent = 500;

      await nftMarketplaceContract.setBuyerFeePercent(newBuyerFeePercent);

      const buyerFeePercent = await nftMarketplaceContract.buyerFeePercent();
      expect(buyerFeePercent).to.equal(newBuyerFeePercent);
    });
  });

  describe("setSellerFeePercent", () => {
    it("Should set seller fee percent", async function () {
      const { nftMarketplaceContract } = await loadFixture(
        deployNFTMarketPlace
      );
      const newSellerFeePercent = 300;

      await nftMarketplaceContract.setSellerFeePercent(newSellerFeePercent);

      const sellerFeePercent = await nftMarketplaceContract.sellerFeePercent();
      expect(sellerFeePercent).to.equal(newSellerFeePercent);
    });
  });
});
