import type { Account } from "./accountMaster";
export const kindIds = [1, 2] as const;
export type KindId = typeof kindIds[number];
export type MonthAmounts = Partial<Record<number, string>>;
export type KindOverrides = Partial<Record<KindId, MonthAmounts>>;
export type InvalidAmountInput = { original: string; inherited: boolean };
/** Temporary number-input errors, keyed by budget kind and month; never stored in SQLite. */
export type KindInvalidAmounts = Partial<Record<KindId, Partial<Record<number, InvalidAmountInput>>>>;
export type AmountSource = { amounts: MonthAmounts; overrides?: KindOverrides; invalidAmounts?: KindInvalidAmounts };
export type KindScreen = "initiative-list" | "cost-table" | "expansion-table";
export type KindSelections = Record<KindScreen, KindId[]>;
export type PreviousKind = 1 | 2;
export const previousKindName = (kind: PreviousKind) => kind === 1 ? "前年見込" : "前年実績";
export type PreviousSelections = Record<"cost-table" | "expansion-table", PreviousKind>;
export type PreviousAmount = { previousKind: PreviousKind; accountId: number; industryId: number; departmentId: number; month: number; amount: string; revision: number; id: number };
export type PlanSettings = { fiscalYear: number; kindSelections: KindSelections; previousAmounts: PreviousAmount[]; previousSelections: PreviousSelections; /** Calculation context only; never persisted. */ previousKind?: PreviousKind };

export function isKindId(value: number): value is KindId { return kindIds.some(id => id === value); }
export function resolvedAmount(source: AmountSource, kind: KindId, month: number): string {
  if (!isKindId(kind)) throw new Error("種別が正しくありません。");
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error("対象月が正しくありません。");
  if (kind === 1) return source.amounts[month] || "0";
  const manual = source.overrides?.[2]?.[month];
  return manual === undefined ? source.amounts[month] || "0" : manual || "0";
}
export function hasInvalidAmountInput(source: AmountSource): boolean {
  return Object.values(source.invalidAmounts ?? {}).some(months => Object.keys(months ?? {}).length > 0);
}

export const INITIAL_KINDS = [{ id: 1, kindName: "一次予算" }, { id: 2, kindName: "確定予算" }] as const;
export type Kind = { id: number; kindName: string };
export type PreviousInput = { previousKind: PreviousKind; invalidNumbers?: boolean; industryId: number; departmentId: number; rows: { accountId: number; amounts: MonthAmounts }[] };
export type PreviousPatch = { previousKind: PreviousKind; industryIdentity: string; departmentIdentity: string; industryId: number; departmentId: number; accountId: number; account: Pick<Account, "accountCode" | "accountName" | "accountType">; month: number; before: string; after: string };
export type PlanChange = { type: "previous-selection"; screen: "cost-table" | "expansion-table"; previousKind: PreviousKind } | { type: "previous"; input: PreviousInput } | { type: "previous-import"; patches: PreviousPatch[] } | { type: "selection"; screen: KindScreen; selected: KindId[] };
