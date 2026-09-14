import React from "react";
import { useParams } from "react-router-dom";
import Expense from "../Transaction/Expense";
import Transfer from "../Transaction/Transfer";
import ViewTransaction from "../Transaction/ViewTransaction";
import Balance from "../Transaction/Balance";
import TReport from "../Transaction/TReport";

const moduleMap = {
  expenses: Expense,
  transfer: Transfer,
  "view-tsaction": ViewTransaction,
  balance: Balance,
  treport: TReport,
};

function ModuleRouterPage() {
  const { name } = useParams();
  const Component = moduleMap[name];
  if (!Component) return <div>Module not found</div>;
  return <Component />;
}

export default ModuleRouterPage;
