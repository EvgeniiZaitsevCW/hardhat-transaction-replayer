# Hardhat Transaction Replayer Utility

## Description

This utility executes on top of the [Hardhat development inironment](https://hardhat.org/) for smart-contracts of
Ethereum-compatible blockchains.

The utility allows to replay a transaction or several on the forked blockchain in
the [Hardhat network](https://hardhat.org/hardhat-network).

It can be used to get the reason of a transaction failure in networks without the tracing possibility.

The order in which a single transaction is replayed:

* get the target transaction from the original network:
* get the target block containing the target transaction from the original network;
* fork the original network at the time of the previous block;
* mint the previous block;
* send and mint all the transactions from the target block up to the target transaction;
* send and mint the target transaction.

## Steps to run

1. Be sure you have NodeJS (at least version 14) and NPM (at least version 6.14) are installed by running:
   ```bash
   node --version
   npm --version
   ```

2. Run the installation of dependencies and
   a [patch](https://github.com/NomicFoundation/hardhat/issues/2395#issuecomment-1043838164) of the Hardhat lib (from
   the root repository directory):
   ```bash
   npm install
   ```

3. Copy the source code of the smart contracts that are related with the studied transaction to
   the [contracts'](./contracts) directory.
   E.g. by creating files `contract1.sol`, `contract2.sol`, etc.
   Do not forget about token contracts is they are involved.

4. Change the `config.networks.hardhat` section of the [hardhat.config.ts](./hardhat.config.ts) file according the
   original network settings: `chainId`, `initialBaseFeePerGas`, `gasPrice`.

5. Change the `config.solidity.version` section of the [hardhat.config.ts](./hardhat.config.ts) file if you need a
   special version of the Solidity compiler for the contracts from step 3. If contracts have different compiler
   versions try the latest one.

6. Check that all contracts are being compiled successfully:
   ```bash
   npx hardhat compile
   ```
   If some contracts are not compiled, fix them (e.g. change the version of the Solidity compiler at the beginning of
   the file).

7. Configure the input parameters (transaction hashes and the original network RPC URL) of the main script in
   the `Script input parameters` section of the [replay.ts](./scripts/replay.ts) file or by setting the
   appropriate environment variables mentioned in the
   file: `SP_RPC_URL`, `SP_TX_HASHES`, `SP_TX_HASHES_FILE`, `SP_TX_HASHES_FILE_COLUMN`, `SP_TX_HASHES_FILE_DELIMITER`, `SP_OUTPUT_FILE`, `SP_VERBOSE_LOGGING`.

   Examples:
   ```bash
   # The RPC URL of the original network.
   export SP_RPC_URL="https://polygon-rpc.com"
   
   # Tx hashes to replay. You can use any delimiter(s) between hashes, except latin letters and digits.
   # A single hash can be provided like export SP_TX_HASHES="0x84766f2002fcf09becb9d42fbc4d4fd20e1fce5b65408e3241e19f59ed1a0f79" 
   export SP_TX_HASHES="0xca284df3888756806e406c50b6e1f9d45c1997c44972704b06f8162de450211f, 0xd556849b8a916d7dff644eb97288ffa1f26e810805cb98ebcbff3f95c8957abe, 0xc55de47da5d63e300e5bcd6d42246572727321cec970048c587a85437f9e057a"
   
   # If the provided path to a csv file is not empty, the script will take the tx hashes from the file instead of SP_TX_HASHES.
   # The hashes will be taken from the column with name $SP_TX_HASHES_COLUMN.
   # The delimiter of the column in the file is defined by the the $SP_COLUMN_DELIMITER.
   # The path can be related or absolute.
   # The default value is "".
   # IMPORTANT. If this variable exists and is not empty the $SP_TX_HASHES variable will be ignored.
   export SP_TX_HASHES_FILE="/example/path/to/input_file.csv"
   
   # The column name contains the tx hashes in the input csv-file if it is used.
   # The default value is "tx_hash".
   export SP_TX_HASHES_COLUMN="tx"
   
   # The column delimiter of the input csv-file if it is used.
   # The default value is "\t" (the tab symbol).
   export SP_COLUMN_DELIMITER=","
   
   # If the provided path to a file is not empty, the script will save the transaction replaying results to the file along with the console output.
   # The output format is <tx_hash>\t<result>.
   # If the file exists it will be appended.
   # The path can be related or absolute.
   # The default value is "".
   export SP_OUTPUT_FILE="/example/path/to/output_file.csv"
   
   # If "true" the console logging will be more detailed.
   # The default value is "false".
   export SP_VERBOSE_LOGGING=false
   ``` 

8. Run the main script:
   ```bash
   npx hardhat run scripts/replay.ts
   ```

9. Observe the console output.

10. Observe the output file if it was provided.
