import { artifacts, ethers, network } from "hardhat";
import { ContractFactory } from "ethers";
import { Artifact } from "hardhat/src/types/artifacts";
import { Provider } from "@ethersproject/providers";
import { ErrorDescription } from "@ethersproject/abi/src.ts/interface";
import { Result } from "@ethersproject/abi";
import {
  BlockWithTransactions,
  TransactionReceipt,
  TransactionResponse
} from "@ethersproject/abstract-provider";
import { Transaction, UnsignedTransaction } from "@ethersproject/transactions";
import { SignatureLike } from "@ethersproject/bytes";
import { parse } from "csv-parse";
import fs from "fs";
import os from "os";

// Script input parameters
const rpcUrl: string = process.env.SP_RPC_URL || "https://polygon-rpc.com";
const txHashes: string = process.env.SP_TX_HASHES || `
0xca284df3888756806e406c50b6e1f9d45c1997c44972704b06f8162de450211f
0xd556849b8a916d7dff644eb97288ffa1f26e810805cb98ebcbff3f95c8957abe
`;
const txHashesFile: string = process.env.SP_TX_HASHES_FILE || "";
const txHashesColumn: string = process.env.SP_TX_HASHES_COLUMN || `tx_hash`;
const columnDelimiter: string = process.env.SP_COLUMN_DELIMITER || `\t`;
const outputFile: string = process.env.SP_OUTPUT_FILE || "";
const verboseLogging: boolean = (process.env.SP_VERBOSE_LOGGING || "false").toLowerCase() === "true";

// Script config
interface Config {
  logSingleLevelIndent: string;
  rpcUrl: string;
  txHashesString: string;
  txHashesFilePath: string;
  txHashesColumn: string;
  columnDelimiter: string;
  outputFilePath: string;
  verboseLogging: boolean;
}

const config: Config = {
  logSingleLevelIndent: "  ",
  rpcUrl,
  txHashesString: txHashes,
  txHashesFilePath: txHashesFile,
  txHashesColumn,
  columnDelimiter,
  outputFilePath: outputFile,
  verboseLogging
};

class Context {
  readonly config: Config;
  readonly startTime: Date;
  readonly startTimeFormatted: string;
  logIndent: string;
  txHashes: string[];
  provider: Provider;
  logEnabled: boolean;

  constructor(config: Config) {
    this.config = config;
    this.logIndent = "";
    this.startTime = new Date(Date.now());
    this.startTimeFormatted = this.#formatDate(this.startTime);
    this.logEnabled = true;
  }

  increaseLogIndent(numberOfSteps: number = 1) {
    this.logIndent += this.config.logSingleLevelIndent.repeat(numberOfSteps);
  }

  decreaseLogIndent(numberOfSteps: number = 1) {
    while (numberOfSteps-- > 0) {
      const endIndex = this.logIndent.lastIndexOf(this.config.logSingleLevelIndent);
      if (endIndex >= 0) {
        this.logIndent = this.logIndent.substring(0, endIndex);
      }
    }
  }

  log(message: string, ...values: any[]) {
    if (!this.logEnabled) {
      return;
    }
    const date = new Date(Date.now());
    const formattedDate = this.#formatDate(date);
    console.log(formattedDate + " " + this.logIndent + message, ...values);
  }

  logEmptyLine() {
    if (!this.logEnabled) {
      return;
    }
    console.log("");
  }

  enableLog() {
    this.logEnabled = true;
  }

  disableLog() {
    this.logEnabled = false;
  }

  previewLogWithTimeSpace(message: string, ...values: any[]): string {
    let result = " ".repeat(this.startTimeFormatted.length) + " " + this.logIndent + message;
    if (values.length > 0) {
      result += "";
      for (let i = 0; i < values.length - 1; ++i) {
        result += values[i].toString() + " ";
      }
      result += values[values.length - 1].toString();
    }
    return result;
  }

  getLogIndentWithTimeSpace(): string {
    return " ".repeat(this.startTimeFormatted.length) + " " + this.logIndent;
  }

  async initTxHashes() {
    if (this.config.txHashesFilePath.length == 0) {
      this.txHashes = this.#getHexNumberArray(this.config.txHashesString);
    } else {
      if (!fs.existsSync(this.config.txHashesFilePath)) {
        throw new Error("The provided file with tx hashes does not exist. Check the settings");
      }
      this.txHashes = [];
      const parser = parse({
        delimiter: this.config.columnDelimiter,
        columns: true,
      });
      const parsedRecords = fs.createReadStream(this.config.txHashesFilePath).pipe(parser);
      for await (const record of parsedRecords) {
        const txHashString = record[this.config.txHashesColumn];
        if (!txHashString) {
          throw new Error(
            `There is no column '${this.config.txHashesColumn}' in the file with tx hashes. Check the settings`
          );
        }
        const txHash: string = this.#getHexNumberArray(txHashString)[0];
        this.txHashes.push(txHash);
      }
    }
  }

  initProvider() {
    this.provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
  }

  initStorageFile() {
    if (this.config.outputFilePath.length != 0) {
      let needInitialization = false;
      if (!fs.existsSync(this.config.outputFilePath)) {
        needInitialization = true;
      } else {
        const fileStat = fs.statSync(this.config.outputFilePath);
        if (fileStat.size == 0) {
          needInitialization = true;
        }
      }

      if (needInitialization) {
        const header = "tx_hash\tresult" + os.EOL;
        fs.appendFileSync(this.config.outputFilePath, header);
      }
    }
  }

  storeResult(txHash: string, result: string) {
    if (this.config.outputFilePath.length != 0) {
      const formattedResult: string = result.replace(/\s+/gi, " ");
      const row = txHash + "\t" + formattedResult + os.EOL;
      fs.appendFileSync(this.config.outputFilePath, row);
    }
  }

  #getHexNumberArray(hexNumberArrayString: string): string[] {
    const hexNumberArray: string[] = hexNumberArrayString.split(/[^0-9a-z]+/ig);
    return hexNumberArray.filter(s => s.length > 0);
  }

  #formatDate(date: Date): string {
    return (
      date.getFullYear().toString().padStart(4, "0") + "-" +
      (date.getMonth() + 1).toString().padStart(2, "0") + "-" +
      date.getDate().toString().padStart(2, "0") + " " +
      date.getHours().toString().padStart(2, "0") + ":" +
      date.getMinutes().toString().padStart(2, "0") + ":" +
      date.getSeconds().toString().padStart(2, "0") + "." +
      date.getMilliseconds().toString().padStart(3, "0")
    );
  }

}

interface ContractEntity {
  artifact: Artifact;
  contractFactory: ContractFactory;
}

const context: Context = new Context(config);

function panicErrorCodeToReason(errorCode: number): string {
  switch (errorCode) {
    case 0x1:
      return "Assertion error";
    case 0x11:
      return "Arithmetic operation underflowed or overflowed outside of an unchecked block";
    case 0x12:
      return "Division or modulo division by zero";
    case 0x21:
      return "Tried to convert a value into an enum, but the value was too big or negative";
    case 0x22:
      return "Incorrectly encoded storage byte array";
    case 0x31:
      return ".pop() was called on an empty array";
    case 0x32:
      return "Array accessed at an out-of-bounds or negative index";
    case 0x41:
      return "Too much memory was allocated, or an array was created that is too large";
    case 0x51:
      return "Called a zero-initialized variable of internal function type";
    default:
      return "???";
  }
}

async function getDeployableContractEntities(): Promise<ContractEntity[]> {
  const contractFullNames: string[] = await artifacts.getAllFullyQualifiedNames();
  const deployableContractEntities: ContractEntity[] = [];
  for (let contractFullName of contractFullNames) {
    const artifact: Artifact = await artifacts.readArtifact(contractFullName);
    if (artifact.bytecode !== "0x") {
      const contractFactory: ContractFactory = await ethers.getContractFactory(contractFullName);
      deployableContractEntities.push({ artifact, contractFactory });
    }
  }
  return deployableContractEntities;
}

async function decodeCustomErrorData(errorData: string): Promise<string[]> {
  const deployableContractEntites = await getDeployableContractEntities();
  const decodedCustomErrorStrings: string[] = [];

  deployableContractEntites.forEach(contractEntity => {
    try {
      const errorDescription: ErrorDescription = contractEntity.contractFactory.interface.parseError(errorData);
      const decodedArgs: string = errorDescription.args.map(arg => {
        const argString = arg.toString();
        if (argString.startsWith("0x")) {
          return `"${argString}"`;
        } else {
          return argString;
        }
      }).join(", ");
      const contractName = contractEntity.artifact.contractName;
      const decodedError = `${errorDescription.errorFragment.name}(${decodedArgs}) -- from contract "${contractName}"`;
      decodedCustomErrorStrings.push(decodedError);
    } catch (e) {
      //do nothing;
    }
  });

  return decodedCustomErrorStrings;
}

function decodeRevertMessage(errorData: string): string {
  const content = `0x${errorData.substring(10)}`;
  const reason: Result = ethers.utils.defaultAbiCoder.decode(["string"], content);
  return `❌ The transaction reverted with string message: '${reason[0]}'.`;
}

function decodePanicCode(errorData: string): string {
  const content = `0x${errorData.substring(10)}`;
  const code: Result = ethers.utils.defaultAbiCoder.decode(["uint"], content);
  const codeHex: string = code[0].toHexString();
  const reason: string = panicErrorCodeToReason(code[0].toNumber());
  return `❌ The transaction reverted due to panic with code: ${codeHex} ('${reason}').`;
}

async function decodeErrorData(errorData: string, context: Context): Promise<string> {
  const decodedCustomErrorStrings = await decodeCustomErrorData(errorData);
  let result: string;
  let isCustomErrorOnly = false;

  if (errorData.startsWith("0x08c379a0")) { // decode Error(string)
    result = decodeRevertMessage(errorData);
  } else if (errorData.startsWith("0x4e487b71")) { // decode Panic(uint)
    result = decodePanicCode(errorData);
  } else {
    isCustomErrorOnly = true;
    if (decodedCustomErrorStrings.length > 0) {
      result = "❌ The transaction reverted with custom error (or several suitable ones):" + os.EOL;
      context.increaseLogIndent(2);
      result += context.getLogIndentWithTimeSpace() +
        decodedCustomErrorStrings.join(os.EOL + context.getLogIndentWithTimeSpace());
      context.decreaseLogIndent(2);
    } else {
      result = `❌ The transaction reverted with a custom error (data: ${errorData}) ` +
        `that cannot be decoded using the provided contracts.` + os.EOL;
      result += context.previewLogWithTimeSpace(
        `Try to add more contract(s) to the "contracts" directory to get decoded error.`
      );
    }
  }
  if (!isCustomErrorOnly) {
    if (decodedCustomErrorStrings.length > 0) {
      result += os.EOL;
      result += context.previewLogWithTimeSpace("Also it can be the following custom error(s):" + os.EOL);
      context.increaseLogIndent(2);
      result += context.getLogIndentWithTimeSpace() +
        decodedCustomErrorStrings.join(os.EOL + context.getLogIndentWithTimeSpace());
      context.decreaseLogIndent(2);
    }
  }
  return result;
}

// Based on this: https://docs.ethers.org/v5/cookbook/transactions/#cookbook--compute-raw-transaction
function defineRawTransaction(tx: Transaction): string {
  function addKey(accum: string, key: string): any {
    if (tx[key] !== undefined && tx[key] !== null) {
      accum[key] = tx[key];
    }
    return accum;
  }

  // Extract the relevant parts of the transaction and signature
  const txFields: string[] =
    "accessList chainId data gasPrice gasLimit maxFeePerGas maxPriorityFeePerGas nonce to type value".split(" ");
  const sigFields: string[] = "v r s".split(" ");

  const t: UnsignedTransaction = txFields.reduce(addKey, {});
  const s: SignatureLike = sigFields.reduce(addKey, {});
  if (t.type == 2) {
    t.gasPrice = undefined;
  }

  // Serialize the signed transaction
  const raw = ethers.utils.serializeTransaction(t, s);

  // Double check things went well
  if (ethers.utils.keccak256(raw) !== tx.hash) {
    throw new Error("serializing failed!");
  }

  return raw;
}

function checkTransaction(
  txResponse: TransactionResponse,
  txReceipt: TransactionReceipt,
) {
  if (!txResponse) {
    throw new Error("The transaction with the provided hash does not exist");
  }
  if (!txResponse.blockNumber) {
    throw new Error("The transaction with the provided hash has not been minted yet");
  }
  if (!txReceipt) {
    throw new Error(" The transaction's receipt has not been found.");
  }
}


async function sendPreviousTransactions(
  block: BlockWithTransactions,
  txResponse: TransactionResponse,
  context: Context
) {
  for (const tx of block.transactions) {
    if (tx.hash === txResponse.hash) {
      break;
    }
    try {
      await ethers.provider.sendTransaction(tx.raw ?? defineRawTransaction(tx));
      context.log(`👉 Sending of transaction with hash ${tx.hash} succeeded!`);
    } catch (e: any) {
      context.log(`👉 Sending of transaction with hash ${tx.hash} failed! The exception message:`, e.message);
    }
  }
}

async function decodeExceptionData(e: any): Promise<string> {
  const errorData = e.data;
  let result: string = "";
  if (!!errorData && errorData.length > 2) {
    result += await decodeErrorData(errorData, context);
  } else if (e.message.includes("reverted without a reason")) {
    result += "❌ The transaction reverted without error data. " +
      "Perhaps the transaction tries to call a nonexistent contract function or " +
      "contains wrong data that cannot be used to call a particular contract function.";
  }
  return result;
}

async function replaySingleTransaction(txHash: string, context: Context): Promise<string> {
  let result: string = "";
  context.log("🏁 Getting the transaction response and receipt from the original network ...");
  const txResponse: TransactionResponse = await context.provider.getTransaction(txHash);
  const txReceipt: TransactionReceipt = await context.provider.getTransactionReceipt(txHash);
  checkTransaction(txResponse, txReceipt);

  if (!txResponse.raw) {
    txResponse.raw = defineRawTransaction(txResponse);
    context.increaseLogIndent();
    context.log("👉 The transaction does not have the raw data. It has been redefined.");
    context.decreaseLogIndent();
  }
  context.log(
    "✔ The transaction has been gotten successfully. Its block number in the original chain:",
    txResponse.blockNumber,
    ". Its raw data:",
    txResponse.raw
  );
  context.logEmptyLine();

  context.log(`🏁 Getting data of the block that contains the transaction ...`);
  const block: BlockWithTransactions = await context.provider.getBlockWithTransactions(txResponse.blockNumber ?? 0);
  if (block.transactions[txReceipt.transactionIndex].hash !== txResponse.hash) {
    throw new Error("The position of the target transaction doesn't match its index in the block transaction array");
  }
  context.log(
    "✔ The block has been gotten successfully. The number of transactions prior the target one:",
    txReceipt.transactionIndex
  );
  context.logEmptyLine();

  const previousBlockNumber = txResponse.blockNumber - 1;
  context.log("🏁 Resetting the Hardhat network with forking for the previous block ...");
  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: context.config.rpcUrl,
          blockNumber: previousBlockNumber,
        },
      },
    ],
  });
  context.log("✔ The resetting has done successfully. The current block:", previousBlockNumber);
  context.logEmptyLine();

  context.log("🏁 Minting the block", previousBlockNumber, "...");
  await ethers.provider.send("evm_mine", []);
  context.log("✔ The minting has done successfully.");
  context.logEmptyLine();

  if (txReceipt.transactionIndex > 0) {
    context.log("🏁 Sending the transactions prior to the target one in the block to the forked network ...");
    context.increaseLogIndent();
    await sendPreviousTransactions(block, txResponse, context);
    context.decreaseLogIndent();
    context.log("✔ All the previous transactions have been sent!");
    context.logEmptyLine();
  }

  context.log("🏁 Sending the target transaction to the forked network ...");
  try {
    await ethers.provider.sendTransaction(txResponse.raw);
    result = "✅ The transaction has been sent and minted successfully!";
  } catch (e: any) {
    const decodingResult: string = await decodeExceptionData(e);
    if (decodingResult.length != 0) {
      result = decodingResult;
    } else {
      result = `❌ The transaction sending or minting has been failed with the exception: ${e.message}`;
    }
  }
  context.log(result);
  return result;
}

function logParameters(context: Context) {
  if (context.config.txHashesFilePath.length == 0) {
    context.log("👉 The transactions are taken from the provided list.");
  } else {
    context.log("👉 The transactions are taken from the provided file:", context.config.txHashesFilePath);
  }
  context.log("👉 The total number of transactions to replay:", context.txHashes.length);
  if (context.config.outputFilePath.length == 0) {
    context.log("👉 The results will not be stored to a file.");
  } else {
    context.log("👉 The results will be stored to file:", context.config.outputFilePath);
  }
  context.logEmptyLine();
}

async function main() {
  context.log(`👋 Transaction replayer is ready.`);
  context.initProvider();
  await context.initTxHashes();
  context.initStorageFile();

  context.increaseLogIndent();
  logParameters(context);
  context.decreaseLogIndent();

  context.log(`🏁 Checking the original network RPC with URL:`, config.rpcUrl, "...");
  const originalNetwork = await context.provider.getNetwork();
  if (originalNetwork.chainId !== network.config.chainId) {
    context.log(
      "⛔ The original network chain ID does not match the one of the Hardhat network! " +
      "Check the settings in the 'hardhat.config.ts' file. Check the original network RPC URL."
    );
    return;
  }
  context.log("✔ The check has been finished successfully. The RPC looks fine.");

  const txTotal = context.txHashes.length;
  const txTotalFormatted = txTotal.toString();
  for (let i = 0; i < txTotal; ++i) {
    const txHash: string = context.txHashes[i];
    const txNumberFormatted = ((i + 1).toString()).padStart(txTotalFormatted.length);
    let result: string = "";
    context.logEmptyLine();
    context.log(`▶ Replaying the transaction ${txNumberFormatted} from ${txTotalFormatted} with hash`, txHash, "...");
    if (!verboseLogging) {
      context.disableLog();
    }
    try {
      context.increaseLogIndent();
      result = await replaySingleTransaction(txHash, context);
      context.decreaseLogIndent();
      if (!verboseLogging) {
        context.enableLog();
        context.log(result);
      }
    } catch (e: any) {
      result = "⛔ An exception rose before transaction sending: " + e.message;
      context.decreaseLogIndent();
      context.enableLog();
      context.log(result);
    }
    context.storeResult(txHash, result);
  }

  context.logEmptyLine();
  context.log("🎉 Everything is done! Bye.");
}

main();
