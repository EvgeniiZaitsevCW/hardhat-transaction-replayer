# Hardhat Transaction Replayer Utility

## Description
This utility executes on top of the [Hardhat development inironment](https://hardhat.org/) for smart-contracts of Ethereum-compartable blockchains.

The utility allows to replay a transaction on the forked blockchain in the [Hardhat network](https://hardhat.org/hardhat-network).

It can be used to get the reason of a transaction failure in networks without the tracing possibility.

## Steps to run
1. Be sure you have NodeJS (at least version 14) and NPM (at leat version 6.14) are installed by running:
   ```bash
   node --version
   npm --version
   ```

2. Run the installation of dependencies and a [patch](https://github.com/NomicFoundation/hardhat/issues/2395#issuecomment-1043838164) of the Hardhat lib (from the root repository directory): 
   ```bash
   npm install
   ```

3. Copy the source code of the smart contracts that are related with the studied transaction to the [contracts](./contracts) directory.
   E.g. by creating files `contract1.sol`, `contract2.sol`, etc.
   Do not forget about token contracts is they are involved.

4. Change the `config.networks.hardhat` section of the [hardhat.config.ts](./hardhat.config.ts) file according the original network settings: `chainId`, `initialBaseFeePerGas`, `gasPrice`.

5. Change the `config.solidity.version` section of the [hardhat.config.ts](./hardhat.config.ts) file if you need a special version of the Solidity compiller for the contracts from step 3.

6. Configure the input parameters (a transaction hash and the original network RPC URL) of the main script in the `Script input parameters` section of the [replayTransaction.ts](./scripts/replayTransaction.ts) file or by setting the appropriate environment variables mentioned in the file, like: `SP_TX_HASH`, `SP_RPC_URL`.

7. Run the main script:
   ```bash
   npx hardhat run scripts/replayTransaction.ts 
   ```

8. Observe the console output.