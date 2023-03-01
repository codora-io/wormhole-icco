const TokenSaleContributor = artifacts.require("TokenSaleContributor");
const ContributorImplementation = artifacts.require(
  "ContributorImplementation"
);
const ContributorSetup = artifacts.require("ContributorSetup");
const ICCOStructs = artifacts.require("ICCOStructs");

const ethereumRootPath = `${__dirname}/..`;
const DeploymentConfig = require(`${ethereumRootPath}/icco_deployment_config.js`);

const fs = require("fs");
const path = require("path");

module.exports = async function(deployer, network) {
  const config = DeploymentConfig[network];
  if (!config) {
    throw Error("deployment config undefined");
  }

  // deploy ICCOStructs library and link to the implementation
  await deployer.deploy(ICCOStructs);
  await deployer.link(ICCOStructs, ContributorImplementation);

  // deploy contributor implementation
  await deployer.deploy(ContributorImplementation);

  // figure out which conductor address to use
  let conductorAddr = undefined;
  if (network == "development") {
    const TokenSaleConductor = artifacts.require("TokenSaleConductor");
    conductorAddr =
      "0x000000000000000000000000" +
      (await TokenSaleConductor.deployed()).address.substring(2);
  } else if (network == "eth_devnet" || network == "eth_devnet2") {
    const fp = `${ethereumRootPath}/../tilt.json`;
    conductorAddr =
      "0x000000000000000000000000" +
      JSON.parse(fs.readFileSync(fp, "utf8")).conductorAddress.substring(2);
  } else if (
    network == "goerli" ||
    network == "fuji" ||
    network == "binance_testnet" ||
    network == "mumbai" ||
    network == "fantom_testnet" ||
    network == "arbitrum_testnet" ||
    network == "optimism_testnet"
  ) {
    const fp = `${ethereumRootPath}/../testnet.json`;
    conductorAddr =
      "0x000000000000000000000000" +
      JSON.parse(fs.readFileSync(fp, "utf8")).conductorAddress.substring(2);
  }

  if (!conductorAddr) {
    throw Error("conductorAddr is undefined");
  }

  if (!config.deployImplementationOnly) {
    // deploy contributor setup
    await deployer.deploy(ContributorSetup);

    // encode initialisation data
    const contributorSetup = new web3.eth.Contract(
      ContributorSetup.abi,
      ContributorSetup.address
    );

    const contributorInitData = contributorSetup.methods
      .setup(
        ContributorImplementation.address,
        config.contributorChainId,
        config.conductorChainId,
        conductorAddr,
        config.wormhole,
        config.tokenBridge,
        config.consistencyLevel
      )
      .encodeABI();

    // deploy conductor proxy
    await deployer.deploy(
      TokenSaleContributor,
      ContributorSetup.address,
      contributorInitData
    );
  }

  // saves in all cases fresh deployments
  if (!config.deployImplementationOnly) {
    const fp = path.join(__dirname, "deployedAddresses.json");
    const contents = fs.existsSync(fp)
      ? JSON.parse(fs.readFileSync(fp, "utf8"))
      : { conductor: {}, contributor: [] };
    const contributor = {
      contributorNetwork: network,
      contributorChain: parseInt(config.contributorChainId),
      contributorAddress: TokenSaleContributor.address,
      contributorContracts: {
        ICCOStructs: ICCOStructs.address,
        ContributorImplementation: ContributorImplementation.address,
        ContributorSetup: ContributorSetup.address,
        TokenSaleContributor: TokenSaleContributor.address,
      },
      verificationString: {
        ICCOStructs: `truffle run verify ICCOStructs@${ICCOStructs.address} --network=${network}`,
        ContributorImplementation: `truffle run verify ContributorImplementation@${ContributorImplementation.address} --network=${network}`,
        ContributorSetup: `truffle run verify ContributorSetup@${ContributorSetup.address} --network=${network}`,
        TokenSaleContributor: `truffle run verify TokenSaleContributor@${TokenSaleContributor.address} --network=${network}`,
      },
    };
    contents.contributor.push(contributor);

    fs.writeFileSync(fp, JSON.stringify(contents, null, 2), "utf8");
  }

  // cache address for registration purposes
  {
    let fp = undefined;
    let addrName = undefined;
    if (network == "eth_devnet") {
      addrName = "ethContributorAddress";
      fp = `${ethereumRootPath}/../tilt.json`;
    } else if (network == "eth_devnet2") {
      addrName = "bscContributorAddress";
      fp = `${ethereumRootPath}/../tilt.json`;
    } else if (
      network == "goerli" ||
      network == "fuji" ||
      network == "binance_testnet" ||
      network == "mumbai" ||
      network == "fantom_testnet"
    ) {
      fp = `${ethereumRootPath}/../testnet.json`;
    }

    if (!!fp) {
      const contents = fs.existsSync(fp)
        ? JSON.parse(fs.readFileSync(fp, "utf8"))
        : {};
      if (network == "eth_devnet" || network == "eth_devnet2") {
        contents[addrName] = TokenSaleContributor.address;
      } else {
        if (!config.deployImplementationOnly) {
          contents[network] = TokenSaleContributor.address;
        } else {
          const implementationString = network.concat(
            "ContributorImplementation"
          );
          contents[implementationString] = ContributorImplementation.address;
        }
      }
      fs.writeFileSync(fp, JSON.stringify(contents, null, 2), "utf8");
    }
  }
};
