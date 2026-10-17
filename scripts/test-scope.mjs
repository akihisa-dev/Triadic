// Ordinary verification must never start workbook generation or XLSX round trips.
export function testScope(args) {
  if (args.length > 1 || (args.length === 1 && args[0] !== "--excel")) {
    throw new Error("引数は --excel のみ指定できます。");
  }
  return args[0] === "--excel";
}

export function scopedTestApi(api, excel = false) {
  if (excel) return api;
  return Object.fromEntries(Object.entries(api).map(([name, value]) => [name,
    typeof value === "function" && name.includes("Workbook") ? () => {
      throw new Error(`通常検証ではExcelテストを実行しません: ${name}。Excelに関わる変更時だけ npm run test:excel を実行してください。`);
    } : value,
  ]));
}
