import palette from "../../Triadic-extension/src/extension/styles/palette.css?raw";

const materials = [
  { id: "none", name: "なし", description: "陰影や模様を加えず、現在の配色をそのまま表示します。" },
  { id: "paper", name: "マットな紙", description: "細かな粒子と控えめな影で、ざらつきのある面を表します。" },
  { id: "glass", name: "すりガラス", description: "背後の帯を透かしてぼかし、縁に薄い光を加えます。" },
  { id: "metal", name: "金属", description: "方向のそろった細い筋と、なだらかな反射で硬い面を表します。" },
  { id: "liquid-smoke", name: "リキッドスモーク", description: "ライトは煙の灰色が均一に溶けた透明な液体、ダークは墨が完全に溶けた深い黒の液体。筋や粒を残さず、光沢と厚みを表します。" },
] as const;
type Material = typeof materials[number]["id"];
const params = new URLSearchParams(location.search);
let selected: Material = materials.find(material => material.id === params.get("material"))?.id ?? "paper";
const rawStrength = params.get("strength");
const parsedStrength = rawStrength !== null && rawStrength.trim() !== "" ? Number(rawStrength) : 60;
let strength = Number.isFinite(parsedStrength) ? Math.max(0, Math.min(100, Math.round(parsedStrength / 5) * 5)) : 60;
const sheet = document.createElement("style");
sheet.textContent = palette.replaceAll(":root", ".material-theme");
document.head.append(sheet);

const main = document.querySelector("main")!;
const choices = document.querySelector<HTMLFieldSetElement>("#materials")!;
const previews = document.querySelector<HTMLElement>("#large-previews")!;
const range = document.querySelector<HTMLInputElement>("#strength")!;

function createStage(theme: string, material: Material, mini = false): HTMLElement {
  const stage = document.createElement("div");
  stage.className = "stage material-theme";
  stage.dataset.theme = theme;
  stage.dataset.material = material;
  const surface = document.createElement("div"); surface.className = "material-surface";
  surface.innerHTML = mini
    ? '<span class="sample-label">営業利益</span><div class="amount">52,000</div>'
    : '<span class="sample-label">営業利益（千円）</span><div class="amount">52,000</div><table class="sample-table"><thead><tr><th scope="col">科目</th><th scope="col">4月</th></tr></thead><tbody><tr><th scope="row">売上高</th><td>1,006,000</td></tr><tr><th scope="row">費用</th><td>954,000</td></tr></tbody></table><label class="sample-field">施策名<input value="配送ルートの見直し" /></label><button class="sample-button" type="button">ダイアログを確認</button>';
  const caption = document.createElement("span"); caption.className = "theme-caption"; caption.textContent = theme === "light" ? "ライト" : "ダーク";
  stage.append(caption, surface);
  return stage;
}
for (const material of materials) {
  const label = document.createElement("label"); label.className = "material-option";
  const name = document.createElement("span"); name.className = "option-name";
  const input = document.createElement("input"); input.type = "radio"; input.name = "material"; input.value = material.id; input.checked = selected === material.id;
  input.setAttribute("aria-label", material.name);
  name.append(input, document.createTextNode(material.name));
  const pair = document.createElement("span"); pair.className = "mini-pair"; pair.setAttribute("aria-hidden", "true");
  for (const theme of ["light", "dark"]) pair.append(createStage(theme, material.id, true));
  label.append(name, pair); choices.append(label);
  input.addEventListener("change", () => { selected = material.id; update(true); });
}
const stages: HTMLElement[] = [];
for (const theme of ["light", "dark"]) {
  const section = document.createElement("section"); section.className = "large-preview";
  section.setAttribute("aria-label", `${theme === "light" ? "ライト" : "ダーク"}の素材感見本`);
  const stage = createStage(theme, selected); stages.push(stage); section.append(stage);
  const dialog = document.createElement("dialog"); dialog.className = "material-dialog material-theme"; dialog.dataset.theme = theme;
  dialog.setAttribute("aria-label", "素材感のダイアログ");
  const dialogStage = createStage(theme, selected, true); stages.push(dialogStage);
  const close = document.createElement("button"); close.type = "button"; close.className = "sample-button"; close.textContent = "閉じる";
  dialogStage.querySelector(".material-surface")!.append(close); dialog.append(dialogStage); section.append(dialog); previews.append(section);
  stage.querySelector("button")!.addEventListener("click", () => dialog.showModal());
  close.addEventListener("click", () => dialog.close());
}

const roles = [["canvas", "画面背景"], ["surface", "入力欄・表・ダイアログ"], ["soft", "見出し・淡い選択"], ["ink", "本文・数値"], ["muted", "補助文字"], ["line", "画面の区切り線"], ["table-line", "表の罫線"], ["table-divider", "月・集計の境界"], ["control-line", "入力欄・選択枠"], ["control-track", "トグル・つまみ"], ["accent", "操作アクセント"]];
const body = document.querySelector("#palette tbody")!;
for (const [token, label] of roles) {
  const row = document.createElement("tr"); const heading = document.createElement("th"); heading.scope = "row"; heading.textContent = label!; row.append(heading);
  for (const theme of ["light", "dark"]) {
    const probe = stages.find(stage => stage.dataset.theme === theme)!;
    const color = getComputedStyle(probe).getPropertyValue(`--${token}`).trim();
    const cell = document.createElement("td"); const value = document.createElement("span"); value.className = "palette-value";
    const swatch = document.createElement("span"); swatch.className = "swatch"; swatch.style.background = color;
    const code = document.createElement("code"); code.textContent = color.toUpperCase(); value.append(swatch, code); cell.append(value); row.append(cell);
  }
  body.append(row);
}
function update(save: boolean) {
  main.style.setProperty("--strength", String(strength / 100));
  range.value = String(strength);
  document.querySelector<HTMLOutputElement>("#strength-value")!.value = `${strength}%`;
  const material = materials.find(candidate => candidate.id === selected)!;
  document.querySelector("#selected-name")!.textContent = material.name;
  document.querySelector("#material-description")!.textContent = material.description;
  document.querySelector("#selection-status")!.textContent = `強さ ${strength}%`;
  stages.forEach(stage => { stage.dataset.material = selected; });
  if (save) {
    const url = new URL(location.href); url.searchParams.set("material", selected); url.searchParams.set("strength", String(strength));
    history.replaceState(null, "", url);
  }
}
range.addEventListener("input", () => { strength = Number(range.value); update(true); });
update(false);
