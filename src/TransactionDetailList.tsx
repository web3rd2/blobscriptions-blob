import React from "react";
import useFetch from "./useFetch";
import TransactionViewer from "./TransactionViewer"; // Import the AttachmentViewer component

export interface ITransactionDetail {
  transaction_hash: string;
  block_blockhash: string;
  block_number: number;
  block_timestamp: number;
  index: number;
  protocol: string;
  ticker: string;
  operation: string;
  from: string;
  to: string;
  amount: string;
  from_before_amount: string;
  from_after_amount: string;
  from_balance: string;
  to_before_amount: string;
  to_after_amount: string;
  to_balance: string;
  gas_fee: string;
  status: string;
}
interface TransactionDetailListProps {
  address: string | undefined;
}
const TransactionDetailList: React.FC<TransactionDetailListProps> = ({
  address,
}: {
  address: string | undefined;
}) => {
  const { data, isLoading } = useFetch<ITransactionDetail[]>(
    `${import.meta.env.VITE_BLOB20_RELAY_URL}/api/getRecords`,
    {
      to: address,
    }
  );

  return (
    <div className="flex flex-col gap-8">
      {isLoading && "loading"}
      {!isLoading &&
        data?.map((item) => (
          <TransactionViewer key={item.transaction_hash} transaction={item} />
        ))}
    </div>
  );
};

export default TransactionDetailList;
