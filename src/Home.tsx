import { Chain, Common, Hardfork } from "@ethereumjs/common";
import { Kzg, initKZG } from "@ethereumjs/util";
import { createKZG } from "kzg-wasm";
import { useEffect, useState } from "react";
import { BIGINT_0, BIGINT_1 } from "@ethereumjs/util";
import Markdown from "react-markdown";
import {
  createWalletClient,
  http,
  parseGwei,
  stringToHex,
  toBlobs,
  isAddress,
} from "viem";

import { privateKeyToAccount } from "viem/accounts";
import { mainnet, sepolia } from "viem/chains";
import { encode } from "cbor-x";

import useFetch from "./useFetch";
import { Button } from "./components/button";
import { Input } from "./components/input";

import TransactionDetailList from "./TransactionDetailList";
import { compressDataWithRatioCheck } from "./gzip";

const fakeExponential = (
  factor: bigint,
  numerator: bigint,
  denominator: bigint
) => {
  let i = BIGINT_1;
  let output = BIGINT_0;
  let numerator_accum = factor * denominator;
  while (numerator_accum > BIGINT_0) {
    output += numerator_accum;
    numerator_accum = (numerator_accum * numerator) / (denominator * i);
    i++;
  }

  return output / denominator;
};

import { createPublicClient } from "viem";

const intro = `
Blobscriptions are ethscriptions that store additional data using EIP-4844 blobs. Blobs are much cheaper than calldata which makes them an ideal choice for storing large amounts of data on-chain. [Read the technical details of BlobScriptions here](https://docs.ethscriptions.com/esips/esip-8-ethscription-attachments-aka-blobscriptions).
`;
interface AccountInfo {
  address: string;
  protocol: string;
  ticker: string;
  balance: string;
}
const buildJSON = (toAddress: string, toAmount: number | undefined) => {
  return {
    protocol: "blob20",
    token: {
      operation: "transfer",
      ticker: "BLOB",
      transfers: [{ to: toAddress, amount: toAmount }],
    },
  };
};
export default function Home() {
  const [kzg, setKzg] = useState<Kzg>();
  const [hash, setHash] = useState<string>("");
  const [privateKey, setPrivateKey] = useState<string>("");
  const [blockData, setBlockData] = useState<any>(null);
  const [toAddress, setToAddress] = useState<string>("");
  const [toAmount, setToAmount] = useState<number>();

  const [pkAddress, setPkAddress] = useState<string | undefined>();

  const [client, setClient] = useState<any>();

  const [blobGasPrice, setBlobGasPrice] = useState<bigint>(BIGINT_0);
  const [maxFeePerGas, setMaxFeePerGas] = useState<bigint | undefined>(
    BIGINT_0
  );
  const [maxPriorityFeePerGas, setMaxPriorityFeePerGas] = useState<
    bigint | undefined
  >(BIGINT_0);

  const {
    data: accountInfos,
    isLoading: accountInfosLoading,
    error: accountInfosError,
  } = useFetch<AccountInfo[]>(
    `${import.meta.env.VITE_BLOB20_RELAY_URL}/api/getAccounts`,
    {
      address: pkAddress,
    }
  );

  useEffect(() => {
    const init = async () => {
      const kzg = await createKZG();
      initKZG(kzg, "");
      setKzg(kzg);
    };

    init();
  }, []);

  useEffect(() => {
    const init = async () => {
      const publicClient = createPublicClient({
        chain: import.meta.env.VITE_NETWORK == "mainnet" ? mainnet : sepolia,
        transport: http(),
      });

      const blockData = await publicClient.getBlock();

      setBlockData(blockData);

      const chain =
        import.meta.env.VITE_NETWORK == "mainnet"
          ? Chain.Mainnet
          : Chain.Sepolia;

      const common = new Common({
        chain: chain,
        hardfork: Hardfork.Cancun,
        customCrypto: { kzg },
      });

      const est = await publicClient.estimateFeesPerGas();

      setMaxFeePerGas(est.maxFeePerGas);
      setMaxPriorityFeePerGas(est.maxPriorityFeePerGas);

      const blobGasPrice = fakeExponential(
        common.param("gasPrices", "minBlobGasPrice"),
        blockData.excessBlobGas,
        common.param("gasConfig", "blobGasPriceUpdateFraction")
      );

      setBlobGasPrice(blobGasPrice);
    };

    init();
  }, []);

  useEffect(() => {
    const initClient = async () => {
      if (privateKey == null) {
        return;
      }
      const isValidAddress = isAddress(privateKey, {
        strict: false,
      });

      let pkAddress;

      if (isValidAddress) {
        setPkAddress(privateKey);
        setClient(null);
        return;
      }

      try {
        // Assuming privateKeyToAccount might throw an error
        const account = privateKeyToAccount(privateKey as `0x${string}`);

        const client = createWalletClient({
          account,
          chain: import.meta.env.VITE_NETWORK == "mainnet" ? mainnet : sepolia,
          transport: http(import.meta.env.VITE_SEND_BLOB_RPC),
        });
        setClient(client);
        pkAddress = privateKey
          ? privateKeyToAccount(privateKey as `0x${string}`).address
          : undefined;

        setPkAddress(pkAddress);
      } catch (error) {
        setClient(null);
      }
    };

    initClient();
  }, [privateKey]);

  const [waitingForTxSubmission, setWaitingForTxSubmission] = useState(false);

  const loading = waitingForTxSubmission;
  const blobJSON = buildJSON(toAddress, toAmount);

  function blobGas() {
    const calculated = blobGasPrice * 2n;
    const floor = parseGwei("10");
    return calculated > floor ? calculated : floor;
  }

  function maxPriorityFeePerGasCalc() {
    const calculated = maxPriorityFeePerGas! * 2n;
    const floor = parseGwei("1");
    return calculated > floor ? calculated : floor;
  }

  async function doBlob() {
    setHash("");

    if (!client) {
      console.error("No client");
      return;
    }

    try {
      setWaitingForTxSubmission(true);

      const encoder = new TextEncoder();
      const arrayBuffer = encoder.encode(JSON.stringify(blobJSON)).buffer;
      const compressedData = await compressDataWithRatioCheck(arrayBuffer);
      const dataObject = {
        contentType: "application/json",
        content: compressedData,
      };
      const encodedData = encode(dataObject);
      const blobData = toBlobs({ data: encodedData });

      const hash = await client.sendTransaction({
        blobs: blobData,
        kzg,
        data: stringToHex("data:;rule=esip6,"),
        maxPriorityFeePerGas: maxPriorityFeePerGasCalc(),
        maxFeePerGas: maxFeePerGas! * 2n,
        maxFeePerBlobGas: blobGas(),
        to: pkAddress,
        // nonce: 55 To unstick an transaction send another with the same nonce and higher gas
      });
      setWaitingForTxSubmission(false);
      console.log("Blob Transaction sent successfully!");
      console.log("Transaction hash:", hash);
      setHash(hash);
    } catch (error: any) {
      console.error("Error sending Blob Transaction:", error);
      alert("Error sending Blob Transaction: " + error);
      setHash("");
      setWaitingForTxSubmission(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 mt-12">
      <h1 className="text-2xl font-semibold">Welcome to BlobScriptions!</h1>
      <Markdown>{intro}</Markdown>
      <h1 className="text-2xl font-semibold">
        Create a BlobScription (network: {import.meta.env.VITE_NETWORK})
      </h1>
      <div className="flex flex-col gap-6">
        <h3 className="text-lg font-semibold">
          Step 1: Enter private key or Address
        </h3>
        <p className="">
          It is not currently possible to create BlobScriptions using a wallet
          like MetaMask. You must use a private key directly. Or Enter Address
          to check Balance
        </p>

        <div className="flex flex-col gap-1">
          <Input
            type="text"
            size={74}
            value={privateKey || ""}
            onChange={(e) => {
              if (!e.target.value || e.target.value.length <= 2) {
                setPrivateKey(e.target.value || "");
                return;
              }
              setPrivateKey(
                e.target.value.startsWith("0x")
                  ? e.target.value
                  : `0x${e.target.value}`
              );
            }}
            placeholder="Private key or Address"
          ></Input>
          {pkAddress && (
            <>
              <p className="text-lg">Your address is {pkAddress}</p>
              <p className="text-lg">
                With balance{" "}
                <span style={{ color: "#22d3eecc" }}>
                  {accountInfosLoading && "loading"}
                  {accountInfosError && "load balance error"}

                  {!accountInfosLoading &&
                    `${!accountInfos ? "null" : accountInfos[0].balance}`}
                </span>{" "}
                $BLOB
              </p>
            </>
          )}
        </div>
        <h3 className="text-lg font-semibold">Step 2: Enter To Address</h3>
        <Input
          type="text"
          size={74}
          value={toAddress || ""}
          placeholder="Enter Transfer to address here (0x...)"
          onChange={(e) => setToAddress(e.target.value)}
        ></Input>

        <h3
          className="text-lg font-semibold"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          Step 3: Enter Transfer Amount
          <span>
            <Button
              className="w-max"
              color="fuchsia"
              style={{ cursor: "pointer" }}
              onClick={() => {
                if (!accountInfos || !accountInfos[0]) {
                  return;
                }
                setToAmount(Number(accountInfos[0].balance));
              }}
              disabled={!accountInfos}
            >
              Max
            </Button>
          </span>
        </h3>
        <Input
          type="number"
          step="0.00000001"
          value={toAmount}
          placeholder="Enter Amount (up to 8 decimal)"
          onChange={(e) => {
            const value = e.target.value;
            const match = value.match(/^[1-9]\d*(\.\d{1,8})?$/);
            if (!match) {
              return;
            }

            setToAmount(parseFloat(match[0]));
          }}
        ></Input>
        <h3 className="text-lg font-semibold">Step 4: Preview Blob JSON</h3>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            wordWrap: "break-word",
            padding: 10,
            borderRadius: 5,
          }}
        >
          {JSON.stringify(blobJSON, null, 2)}
        </pre>

        {blockData && (
          <Button
            color="fuchsia"
            className="w-max mx-auto mt-4"
            disabled={
              !!loading ||
              !client ||
              !toAddress ||
              !toAmount ||
              privateKey === pkAddress
            }
            onClick={doBlob}
            style={{ cursor: "pointer" }}
          >
            Step 5: Transfer
          </Button>
        )}

        {hash && (
          <div>
            <h3>
              Blob tx sent! Once it has been included in a block, your
              BlobScription will appear in the list below shortly.
            </h3>
            <p>
              Tx hash:{" "}
              <a
                href={`${import.meta.env.VITE_ETHERSCAN_BASE_URL}/tx/${hash}`}
                target={"_blank"}
              >
                {hash}
              </a>
            </p>
          </div>
        )}
      </div>
      <div className="">
        <h3 className="text-2xl font-semibold my-8"> Blob History</h3>
        {pkAddress && <TransactionDetailList address={pkAddress} />}
      </div>
    </div>
  );
}
