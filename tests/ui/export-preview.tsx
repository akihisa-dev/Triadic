import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SpreadsheetIOPage } from '../../Triadichrome-extension/src/extension/SpreadsheetIOPage';
import { readPlanContents } from '../../Triadichrome-extension/src/core/storage/readPlan';
import { createSamplePlan } from './sample-plan';
import '../../Triadichrome-extension/src/extension/ExtensionPage.css';
if (!import.meta.env.DEV) throw new Error('開発専用です。');
const contents = await readPlanContents(await createSamplePlan());
let showResult: (text: string) => void = () => {};
const nativeClick = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function () {
  if (!this.download) { nativeClick.call(this); return; }
  const name = this.download;
  void fetch(this.href).then(response => response.arrayBuffer()).then(bytes => showResult(`${name} · ${bytes.byteLength}bytes（ダウンロードなし）`));
};
const Original = Worker;
window.Worker = new Proxy(Original, { construct(target, args) {
  const worker = Reflect.construct(target, args) as Worker;
  if (String(args[0]).includes('workbookExport.worker')) Object.defineProperty(worker, 'onmessage', { configurable: true, set(listener: (event: MessageEvent) => void) {
    worker.addEventListener('message', event => setTimeout(() => listener(event), 1500));
  } });
  return worker;
} });
function Example() {
  const [result, setResult] = useState('出力の画面確認用です。ファイルはダウンロードしません。');
  showResult = setResult;
  return <><p role="status">{result}</p><SpreadsheetIOPage contents={contents} busy={false} onChangePlan={async () => {}} onPrepareSave={async () => {}} onPendingChange={() => {}} /></>;
}
createRoot(document.getElementById('root')!).render(<Example />);
