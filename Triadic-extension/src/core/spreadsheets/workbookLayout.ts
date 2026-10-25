import ExcelJS from "exceljs";

export const amountFormat = '[>=0.5]#,##0;[<=-0.5]-#,##0;""';
export const font = { name: "Yu Gothic", size: 10, color: { argb: "FF202020" } };
export const fill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFF3F3F3" } };
export const border = { style: "thin" as const, color: { argb: "FFE0E0E0" } };
export function sheet(workbook: ExcelJS.Workbook, name: string, widths: number[], headers: number, frozen: number) {
  const ws = workbook.addWorksheet(name, { views: [{ state: "frozen", xSplit: frozen, ySplit: headers + 2 }] });
  widths.forEach((width, index) => { ws.getColumn(index + 1).width = width; });
  ws.getCell(1, 1).value = name;
  ws.getCell(1, 1).font = { ...font, size: 14, bold: true };
  return ws;
}
export function finish(ws: ExcelJS.Worksheet, headerEnd: number, shaded: Set<number> = new Set()) {
  for (let r = 3; r <= ws.rowCount; r++) {
    ws.getRow(r).height = 21;
    for (let c = 1; c <= ws.columnCount; c++) {
      const cell = ws.getCell(r, c);
      cell.font = { ...font, bold: r <= headerEnd || shaded.has(r) };
      cell.border = { top: border, bottom: border, left: border, right: border };
      cell.alignment = { vertical: "middle", horizontal: r <= headerEnd ? "center" : typeof cell.value === "string" ? "left" : "right", wrapText: c === 1 || c === 2 };
      if (r <= headerEnd || shaded.has(r)) cell.fill = fill;
      if (r > headerEnd && !cell.numFmt) cell.numFmt = amountFormat;
    }
  }
  ws.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `1:${headerEnd}` };
}
export function workbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Triadic";
  wb.calcProperties.fullCalcOnLoad = true;
  return wb;
}
