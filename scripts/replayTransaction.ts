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

// Script input parameters
const txHash: string = process.env.SP_TX_HASH || "0x0000000000000000000000000000000000000000000000000000000000000001";
const rpcUrl: string = process.env.SP_RPC_URL || "http://127.0.0.1:9933";

// Script parameters
const textLevelIndent = "  ";

interface ContractEntity {
  artifact: Artifact;
  contractFactory: ContractFactory;
}

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
  return `Reverted with the message: "${reason[0]}".`;
}

function decodePanicCode(errorData: string): string {
  const content = `0x${errorData.substring(10)}`;
  const code: Result = ethers.utils.defaultAbiCoder.decode(["uint"], content);
  const codeHex: string = code[0].toHexString();
  const reason: string = panicErrorCodeToReason(code[0].toNumber());
  return `Panicked with the code: "${codeHex}"(${reason}).`;
}

async function decodeErrorData(errorData: string, textIndent: string): Promise<string> {
  const nextLevelTextIndent = textIndent + textLevelIndent;
  const decodedCustomErrorStrings = await decodeCustomErrorData(errorData);
  let result: string;
  let isCustomErrorOnly = false;

  if (errorData.startsWith("0x08c379a0")) { // decode Error(string)
    result = textIndent + decodeRevertMessage(errorData);
  } else if (errorData.startsWith("0x4e487b71")) { // decode Panic(uint)
    result = textIndent + decodePanicCode(errorData);
  } else {
    isCustomErrorOnly = true;
    if (decodedCustomErrorStrings.length > 0) {
      result = textIndent + "Reverted with a custom error (or several suitable ones):\n" +
        nextLevelTextIndent + decodedCustomErrorStrings.join("\n" + nextLevelTextIndent);
    } else {
      result = textIndent + "Reverted with a custom error that can't be decoded using the provided contracts.\n" +
        textIndent + `Try to add more contract(s) to the "contracts" directory to get decoded error.`;
    }
  }
  if (!isCustomErrorOnly) {
    if (decodedCustomErrorStrings.length > 0) {
      result += "\n" + textIndent + "Also it can be the following custom error(s):\n" + nextLevelTextIndent +
        decodedCustomErrorStrings.join("\n" + nextLevelTextIndent);
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
  const txFields: string[] = "accessList chainId data gasPrice gasLimit maxFeePerGas maxPriorityFeePerGas nonce to type value".split(" ");
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
  textIndent: string
): boolean {
  if (!txResponse) {
    console.log(textIndent + "⛔ The transaction with the provided hash does not exist.");
    return false;
  }
  if (!txResponse.blockNumber) {
    console.log(textIndent + "⛔ The transaction with the provided hash has not been minted yet.");
    return false;
  }
  if (!txReceipt) {
    console.log(textIndent + "⛔ The transaction's receipt has not been found.");
    return false;
  }
  return true;
}


async function sendPreviousTransactions(
  block: BlockWithTransactions,
  txResponse: TransactionResponse,
  textIndent: string
) {
  for (const tx of block.transactions) {
    if (tx.hash === txResponse.hash) {
      break;
    }
    try {
      await ethers.provider.sendTransaction(tx.raw ?? defineRawTransaction(tx));
      console.log(textIndent + `👉 Sending of transaction with hash ${tx.hash} succeeded!`);
    } catch (e: any) {
      console.log(
        textIndent + `👉 Sending of transaction with hash ${tx.hash} failed! The exception message:`, e.message
      );
    }
  }
}

async function main() {
  console.log(`🏁 Replaying the transaction with hash`, txHash, "...");
  const textIndent1 = textLevelIndent;
  const textIndent2 = textIndent1 + textLevelIndent;
  const textIndent3 = textIndent2 + textLevelIndent;
  console.log(textIndent1 + `👉 Original network RPC URL:`, rpcUrl);
  const provider: Provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  console.log("");

  console.log(textIndent1 + "🏁 Getting the transaction response and receipt from the original network ...");
  const txResponse: TransactionResponse = await provider.getTransaction(txHash);
  const txReceipt: TransactionReceipt = await provider.getTransactionReceipt(txHash);
  if (!checkTransaction(txResponse, txReceipt, textIndent1)) {
    return;
  }
  if (!txResponse.raw) {
    txResponse.raw = defineRawTransaction(txResponse);
    console.log(textIndent2 + "👉 The transaction does not have the raw data. It has been redefined.");
  }
  console.log(textIndent1 + "✅ The transaction has been gotten successfully:");
  console.log(textIndent2 + "👉 The block number of the transaction in the original chain:", txResponse.blockNumber);
  console.log(textIndent2 + "👉 The raw data of the signed transaction:", txResponse.raw);
  console.log("");

  console.log(textIndent1 + `🏁 Getting data of the block with other transactions ...`);
  const block: BlockWithTransactions = await provider.getBlockWithTransactions(txResponse.blockNumber ?? 0);
  if (block.transactions[txReceipt.transactionIndex].hash !== txResponse.hash) {
    console.log(textIndent1 + "⛔ The position of the target tx in the tx array doesn't match its index in the block.");
    return;
  }
  console.log(
    textIndent1 + "✅ The block has been gotten successfully. The number of txs prior the target one:",
    txReceipt.transactionIndex
  );
  console.log("");

  const previousBlockNumber = txResponse.blockNumber - 1;
  console.log(textIndent1 + "🏁 Resetting the Hardhat network with forking for the previous block ...");
  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: rpcUrl,
          blockNumber: previousBlockNumber,
        },
      },
    ],
  });
  console.log(textIndent1 + "✅ The resetting has done successfully. The current block:", previousBlockNumber);
  console.log("");

  console.log(textIndent1 + "🏁 Minting the block", previousBlockNumber, "...");
  await ethers.provider.send("evm_mine", []);
  console.log(textIndent1 + "✅ The minting has done successfully.");
  console.log("");

  if (txReceipt.transactionIndex > 0) {
    console.log(
      textIndent1 + "🏁 Sending the transactions prior to the target one in the block to the forked network ..."
    );
    await sendPreviousTransactions(block, txResponse, textIndent2);
    console.log(textIndent1 + "✅ All the previous transactions have been sent!");
    console.log("");
  }

  console.log(textIndent1 + "🏁 Sending the target transaction to the forked network ...");
  try {
    await ethers.provider.sendTransaction(txResponse.raw);
    console.log(textIndent1 + "✅ The transaction has been sent and minted successfully!");
  } catch (e: any) {
    const errorData = e.data;
    console.log(textIndent1 + `❌ The transaction sending or minting has been failed!`);
    console.log(textIndent2 + `👉 The exception message:`, e.message);
    if (!!errorData && errorData.length > 2) {
      console.log(textIndent2 + "👉 The result of error data decoding:");
      console.log(await decodeErrorData(errorData, textIndent3 + " "));
    } else if (e.message.includes("reverted without a reason")) {
      console.log(textIndent2 + "👉 There is no error data. " +
        "Perhaps the transaction tried to call a nonexistent contract function or " +
        "contains wrong data that cannot be used to call a particular contract function."
      );
    }
  }
}

main();