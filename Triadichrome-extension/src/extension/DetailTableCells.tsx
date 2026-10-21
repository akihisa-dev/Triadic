import { memo } from "react";
import { detailTableMonths } from "../core/tables/detailTable";

export type TableCellHandlers = {
  select: (item: number, column: number) => void;
  change: (item: number, column: number, value: string) => void;
  advance: (item: number, column: number) => void;
  paste: (item: number, column: number, text: string) => void;
};
type Shared = { editing: boolean; disabled: boolean; handlers: TableCellHandlers };
type CellProps = Shared & { item: number; column: number; value: string };
const DetailTableCell = memo(function DetailTableCell({ item, column, value, editing, disabled, handlers }: CellProps) {
  if (!editing) return <div className="detail-table-value">{value || "\u00a0"}</div>;
  return <textarea rows={1} data-item={item} data-column={column}
    aria-label={column === 0 ? `項目 ${item + 1}の名前` : `項目 ${item + 1}の${detailTableMonths[column - 1]!.label}`} value={value} disabled={disabled}
    onFocus={() => handlers.select(item, column)}
    onChange={event => handlers.change(item, column, event.target.value)}
    onKeyDown={event => {
      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
        event.preventDefault(); handlers.advance(item, column);
      }
    }}
    onPaste={event => {
      const text = event.clipboardData.getData("text/plain");
      if (!/[\t\r\n]/.test(text)) return;
      event.preventDefault(); handlers.paste(item, column, text);
    }} />;
});

const HorizontalRow = memo(function HorizontalRow({ values, item, ...shared }: Shared & { values: string[]; item: number }) {
  return <tr><th scope="row"><DetailTableCell {...shared} item={item} column={0} value={values[0]!} /></th>
    {detailTableMonths.map((month, m) => <td key={month.id}><DetailTableCell {...shared} item={item} column={m + 1} value={values[m + 1]!} /></td>)}
  </tr>;
});
function sameColumn(a: string[][], b: string[][], column: number) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && a[i]![column] !== b[i]![column]) return false;
  return true;
}
function sameControls(a: Shared, b: Shared) {
  return a.editing === b.editing && a.disabled === b.disabled && a.handlers === b.handlers;
}
const VerticalRow = memo(function VerticalRow({ cells, column, ...shared }: Shared & { cells: string[][]; column: number }) {
  return <tr><th scope="row">{detailTableMonths[column - 1]!.label}</th>
    {cells.map((values, i) => <td key={i}><DetailTableCell {...shared} item={i} column={column} value={values[column]!} /></td>)}
  </tr>;
}, (a, b) => a.column === b.column && sameControls(a, b) && sameColumn(a.cells, b.cells, a.column));

export const DetailTableColumns = memo(function DetailTableColumns({ count }: { count: number }) {
  return <colgroup><col className="detail-table-label-column" />{Array.from({ length: count }, (_, i) => <col key={i} />)}</colgroup>;
});
export const DetailTableHead = memo(function DetailTableHead({ cells, horizontal, ...shared }: Shared & { cells: string[][]; horizontal: boolean }) {
  return <thead><tr><th className="detail-table-corner" scope="col">{horizontal ? "項目" : "月"}</th>
    {horizontal ? detailTableMonths.map(month => <th key={month.id} scope="col">{month.label}</th>)
      : cells.map((values, i) => <th key={i} scope="col"><DetailTableCell {...shared} item={i} column={0} value={values[0]!} /></th>)}
  </tr></thead>;
}, (a, b) => a.horizontal === b.horizontal && (a.horizontal || (sameControls(a, b) && sameColumn(a.cells, b.cells, 0))));

export function DetailTableRows({ cells, horizontal, ...shared }: Shared & { cells: string[][]; horizontal: boolean }) {
  return <tbody>{horizontal ? cells.map((values, i) => <HorizontalRow key={i} {...shared} item={i} values={values} />)
    : detailTableMonths.map((month, m) => <VerticalRow key={month.id} {...shared} cells={cells} column={m + 1} />)}</tbody>;
}
