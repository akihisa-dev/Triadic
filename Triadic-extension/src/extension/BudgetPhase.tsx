import { createContext, useContext } from "react";
import type { KindId } from "../core/domain/kinds";
export const BudgetPhaseContext = createContext<KindId | null>(null);
export const useBudgetPhase = () => useContext(BudgetPhaseContext);
