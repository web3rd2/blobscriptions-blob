import React from "react";

import { ITransactionDetail } from "./TransactionDetailList";

interface TransactionViewerProps {
  transaction: ITransactionDetail;
}
const TransactionViewer: React.FC<TransactionViewerProps> = ({
  transaction,
}) => {
  return (
    <div className="bg-gray-800 text-white shadow rounded-lg p-6 mb-4">
      <h3 className="text-lg font-semibold mb-4">Transaction Details</h3>
      <div className="divide-y divide-gray-700">
        <DetailRow label="Hash:" value={transaction.transaction_hash} />
        <DetailRow label="Block:" value={`${transaction.block_number}`} />
        <DetailRow label="From:" value={transaction.from} />
        <DetailRow label="To:" value={transaction.to} />
        <DetailRow label="Ticker:" value={transaction.ticker} />
        <DetailRow label="Amount:" value={transaction.amount} />
        <DetailRow label="Operation:" value={transaction.operation} />
        <DetailRow
          label="Status:"
          value={transaction.status}
          additionalClasses={
            transaction.status === "success" ? "text-green-400" : "text-red-400"
          }
        />
      </div>
    </div>
  );
};
const DetailRow: React.FC<{
  label: string;
  value: string;
  additionalClasses?: string;
}> = ({ label, value, additionalClasses }) => (
  <div className="py-3 flex justify-between items-center">
    <span className="text-gray-400">{label}</span>
    <span className={`font-medium ${additionalClasses || "text-white"}`}>
      {value}
    </span>
  </div>
);

export default TransactionViewer;
