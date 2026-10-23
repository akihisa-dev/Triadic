import type ExcelJS from "exceljs";
import { initiativeMonths, type InitiativeMonth } from "../domain/calendar";

export const reportSourceSheet = "計算元";
export const reportSourceReference = `'${reportSourceSheet.replaceAll("'", "''")}'!`;
const descriptions = [
  ["category", "区分"], ["industry", "業種"], ["department", "部署"], ["initiative", "施策"],
  ["kind", "種別"], ["accountCode", "科目コード"], ["accountName", "科目名"], ["accountType", "科目属性"],
] as const;
const identifiers = [["accountId", "科目ID"], ["initiativeId", "施策ID"], ["kindId", "種別ID"], ["included", "総原価対象"]] as const;
type MonthKey = `month${InitiativeMonth}`;
export const reportSourceColumns = [
  ...descriptions.map(([key, header]) => ({ key, header, role: "description" as const })),
  ...initiativeMonths.map(month => ({ key: `month${month}` as MonthKey, header: `${month}月`, role: "amount" as const })),
  ...identifiers.map(([key, header]) => ({ key, header, role: "identifier" as const })),
];
export type ReportSourceKey = typeof reportSourceColumns[number]["key"];
const numbers = new Map(reportSourceColumns.map((column, index) => [column.key, index + 1]));
export const reportSourceColumn = (key: ReportSourceKey): number => numbers.get(key)!;
export const reportSourceMonthColumn = (month: InitiativeMonth): number => reportSourceColumn(`month${month}`);
export const reportSourceMonthColumns = initiativeMonths.map(reportSourceMonthColumn);
export const reportSourceRange = (letter: string): string => `${reportSourceReference}$${letter}:$${letter}`;
export const reportSourceHelperColumn = (column: number, component: number): number =>
  reportSourceColumns.length + 1 + component * reportSourceMonthColumns.length + reportSourceMonthColumns.indexOf(column);
type Value = ExcelJS.CellValue | undefined;
export const reportSourceRow = (values: Record<ReportSourceKey, Value>): Value[] => reportSourceColumns.map(column => values[column.key]);
export const reportSourceAmounts = (value: (month: InitiativeMonth) => Value): Record<MonthKey, Value> =>
  Object.fromEntries(initiativeMonths.map(month => [`month${month}`, value(month)])) as Record<MonthKey, Value>;
