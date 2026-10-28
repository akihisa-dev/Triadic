import palette from "../../Triadic-extension/src/extension/styles/palette.css?raw";
import draft from "./color-design-draft.css?raw";

type Theme = "light" | "dark";
const labels: Record<string, string> = {
  canvas: "画面背景", surface: "入力欄・表・ダイアログ", soft: "見出し・淡い選択", ink: "本文・数値", muted: "補助文字",
  line: "画面の区切り線", "table-line": "表の罫線", "table-divider": "月・集計の境界", "control-track": "トグル・つまみ",
  "control-line": "入力欄・選択枠", accent: "操作アクセント", "accent-ink": "集計の所属先", "accent-subtle": "所属の淡い面",
  "accent-soft": "淡い選択面", "accent-selected": "選択面", "accent-drop": "ドロップ先", "selected-month": "選択月",
  "period-quarter": "四半期", "period-half": "半期", "period-annual": "年間", focus: "キーボードフォーカス",
  "on-ink": "反転面の文字", "ink-hover": "反転ボタンのホバー", "inverse-muted": "反転面の補助文字", "shadow-rgb": "影のRGB", backdrop: "ダイアログ背後",
};
function declarations(css: string, theme: Theme): Map<string, string> {
  const result = new Map<string, string>();
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const block of withoutComments.matchAll(/:root(\[data-theme="dark"\])?\s*\{([^}]+)\}/g)) {
    if (block[1] && theme !== "dark") continue;
    for (const entry of block[2]!.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) result.set(entry[1]!, entry[2]!.trim());
  }
  return result;
}
const sheet = document.createElement("style");
sheet.textContent = palette.replaceAll(":root", '[data-palette="spec"]')
  + palette.replaceAll(":root", '[data-palette="draft"]')
  + draft.replaceAll(":root", '[data-palette="draft"]');
document.head.append(sheet);
const root = document.querySelector<HTMLElement>("#color-design")!;
const status = document.querySelector<HTMLOutputElement>("#design-status")!;
const overrides: Record<Theme, Map<string, string>> = { light: new Map(), dark: new Map() };
const panels: { theme: Theme; preview: HTMLElement; spec: HTMLElement; candidate: HTMLElement; refresh: () => void }[] = [];
const basic = ["canvas", "surface", "soft", "ink", "muted", "line", "table-line", "table-divider", "control-line", "control-track", "accent"];

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
}
function makeSample(theme: Theme): HTMLElement {
  const sample = element("section", "color-sample");
  sample.dataset.palette = "draft"; sample.dataset.theme = theme;
  sample.setAttribute("aria-label", `${theme === "light" ? "ライト" : "ダーク"}の画面見本`);
  // Fixed demonstration content only: no plan data or file operations.
  sample.innerHTML = `<div class="sample-top"><strong>Triadic</strong><span>2027年度</span></div>
    <h3>総原価表</h3><div class="sample-note">金額：千円</div>
    <div class="sample-table-region"><table class="sample-table" aria-label="配色見本の総原価表">
      <thead><tr><th scope="col">科目</th><th scope="col">4月</th><th scope="col" class="quarter">第1四半期</th><th scope="col" class="half">上期</th><th scope="col" class="annual">年間</th></tr></thead>
      <tbody><tr><th scope="row">売上高</th><td>1,006,000</td><td class="quarter">3,018,000</td><td class="half">6,036,000</td><td class="annual">12,072,000</td></tr>
      <tr><th scope="row">費用</th><td>954,000</td><td class="quarter">2,862,000</td><td class="half">5,724,000</td><td class="annual">11,448,000</td></tr>
      <tr class="total"><th scope="row">営業利益</th><td>52,000</td><td class="quarter">156,000</td><td class="half">312,000</td><td class="annual">624,000</td></tr></tbody></table></div>
    <div class="sample-fields"><label>施策名<input value="配送ルートの見直し" /></label><label>4月の増減<input value="−100" /></label></div>
    <div class="sample-selection">選択月：4月</div><div class="sample-membership">所属先：売上高</div>
    <div class="sample-actions"><button type="button" class="primary" data-open-dialog>施策を追加</button><button type="button" data-focus-input>入力欄を選択</button></div>
    <dialog aria-label="施策を追加"><h3>施策を追加</h3><label>施策名<input placeholder="施策名を入力" /></label><div class="sample-actions"><button type="button" data-close-dialog>閉じる</button></div></dialog>`;
  const dialog = sample.querySelector("dialog")!;
  sample.querySelector("[data-open-dialog]")!.addEventListener("click", () => dialog.showModal());
  sample.querySelector("[data-close-dialog]")!.addEventListener("click", () => dialog.close());
  sample.querySelector("[data-focus-input]")!.addEventListener("click", () => sample.querySelector("input")!.focus());
  return sample;
}
function valueLabel(value: string): string { return /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : value; }
function makePalette(theme: Theme, spec: HTMLElement, candidate: HTMLElement, names: string[]): { table: HTMLTableElement; refresh: () => void } {
  const table = element("table", "palette-table");
  table.setAttribute("aria-label", `${theme === "light" ? "ライト" : "ダーク"}の仕様カラーパレットと確認案`);
  const head = element("thead"); const header = element("tr");
  for (const name of ["用途", "仕様", "確認案"]) { const th = element("th", "", name); th.scope = "col"; header.append(th); }
  head.append(header); table.append(head);
  const body = element("tbody"); table.append(body);
  const specValues = declarations(palette, theme);
  const draftValues = new Map([...specValues, ...declarations(draft, theme)]);
  const updates: (() => void)[] = [];
  for (const name of names) {
    const row = element("tr"); row.dataset.token = name;
    const label = element("th", "", labels[name] ?? name); label.scope = "row"; label.append(element("code", "", `--${name}`)); row.append(label);
    for (const mode of ["spec", "draft"] as const) {
      const cell = element("td"); const group = element("div", "color-value"); const swatch = element("span", "swatch");
      // Each swatch inherits the same resolved palette as its matching sample.
      swatch.dataset.palette = mode; swatch.dataset.theme = theme;
      const text = element("code");
      const declared = (mode === "spec" ? specValues : draftValues).get(name)!;
      const source = getComputedStyle(candidate).getPropertyValue(`--${name}`).trim();
      const editable = mode === "draft" && /^#[0-9a-f]{6}$/i.test(declared);
      const input = editable ? element("input") : null;
      if (input) {
        input.type = "color"; input.value = source;
        input.setAttribute("aria-label", `${theme === "light" ? "ライト" : "ダーク"}の${labels[name] ?? name}の確認案`);
        input.addEventListener("input", () => {
          overrides[theme].set(name, input.value);
          document.querySelector<HTMLInputElement>('input[name="appearance"][value="draft"]')!.checked = true;
          applyOverrides();
          status.textContent = "確認案を編集中（製品には未反映）";
        });
        group.append(input);
      } else group.append(swatch);
      group.append(text); cell.append(group); row.append(cell);
      updates.push(() => {
        const node = mode === "spec" ? spec : candidate;
        const raw = getComputedStyle(node).getPropertyValue(`--${name}`).trim();
        const override = mode === "draft" ? overrides[theme].get(name) : undefined;
        text.textContent = valueLabel(raw);
        if (input) input.value = override ?? source;
        text.classList.toggle("changed", mode === "draft" && raw !== getComputedStyle(spec).getPropertyValue(`--${name}`).trim());
        swatch.style.background = name === "shadow-rgb" ? `rgb(${raw})` : raw;
      });
    }
    body.append(row);
  }
  return { table, refresh: () => updates.forEach(update => update()) };
}
for (const theme of ["light", "dark"] as const) {
  const column = element("section", "theme-column"); column.dataset.themeColumn = theme;
  column.append(element("h2", "", theme === "light" ? "ライト" : "ダーク"));
  const preview = makeSample(theme); column.append(preview);
  const probes = (["spec", "draft"] as const).map(mode => {
    const probe = element("div", "palette-probe"); probe.dataset.palette = mode; probe.dataset.theme = theme; column.append(probe); return probe;
  });
  root.append(column);
  const spec = probes[0]!; const candidate = probes[1]!;
  column.append(element("h3", "", "仕様カラーパレット"));
  const base = makePalette(theme, spec, candidate, basic); column.append(base.table);
  const detail = element("details"); detail.append(element("summary", "", "選択・期間・派生色"));
  const derived = makePalette(theme, spec, candidate, [...declarations(palette, theme).keys()].filter(name => !basic.includes(name)));
  detail.append(derived.table); column.append(detail);
  panels.push({ theme, preview, spec, candidate, refresh: () => { base.refresh(); derived.refresh(); } });
}
function applyOverrides() {
  const mode = document.querySelector<HTMLInputElement>('input[name="appearance"]:checked')!.value;
  for (const panel of panels) {
    panel.preview.dataset.palette = mode;
    for (const node of [panel.preview, panel.candidate]) {
      node.removeAttribute("style");
      if (node === panel.candidate || mode === "draft") for (const [name, value] of overrides[panel.theme]) node.style.setProperty(`--${name}`, value);
    }
    panel.refresh();
  }
}
document.querySelectorAll<HTMLInputElement>('input[name="appearance"]').forEach(input => input.addEventListener("change", applyOverrides));
document.querySelector("#reset-colors")!.addEventListener("click", () => {
  overrides.light.clear(); overrides.dark.clear(); applyOverrides(); status.textContent = "確認案を初期状態に戻しました";
});
applyOverrides(); status.textContent = "確認できます";
