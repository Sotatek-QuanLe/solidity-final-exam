require("dotenv").config();
const { ethers, upgrades } = require("hardhat");
async function main() {
  const NFTMarketplaceContract = await ethers.getContractFactory(
    "NFTMarketplace"
  );
  const nftMarketplace = await upgrades.deployProxy(
    NFTMarketplaceContract,
    [process.env.TREASURY],
    { initializer: "initialize" }
  );

  console.log(`NFT Marketplace contract deployed: `, nftMarketplace.target);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
