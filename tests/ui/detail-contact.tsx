import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DetailPartsCanvas } from '../../Triadichrome-extension/src/extension/DetailPartsCanvas';
import type { DetailPart } from '../../Triadichrome-extension/src/core/tables/detailParts';
import '../../Triadichrome-extension/src/extension/styles/base.css';
if (!import.meta.env.DEV) throw new Error('開発サーバー専用です。');
function Harness() {
  const [parts, setParts] = useState<DetailPart[]>([
    {id:'a',kind:'text',text:'動かすパーツ',x:72,y:144,width:72,height:96},
    {id:'b',kind:'text',text:'その場で凹むパーツ',x:192,y:144,width:72,height:96},
  ]);
  return <main style={{height:'90vh',display:'flex',flexDirection:'column'}}><h1>明細の接触確認</h1><DetailPartsCanvas parts={parts} disabled={false} onChange={setParts}/><output>{JSON.stringify(parts.map(({id,x,y})=>({id,x,y})))}</output></main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
