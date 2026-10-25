import {test,expect} from '@playwright/test';
test('月見出しの順方向・逆方向のTab移動で固定列の裏へフォーカスを隠さない',async({page})=>{
  test.setTimeout(60000);await page.goto('/tests/ui/initiative-list-focus.html?count=500');
  const first=page.getByRole('button',{name:'4月 売上で並べ替え',exact:true});await first.focus();
  async function visible(){await expect.poll(()=>page.evaluate(()=>{
    const element=document.activeElement as HTMLElement,r=element.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return !!hit&&element.contains(hit);
  })).toBe(true);}
  await visible();for(let i=0;i<71;i++){await page.keyboard.press('Tab');await visible();}
  await expect(page.getByRole('button',{name:'3月 利益を絞り込む',exact:true})).toBeFocused();
  for(let i=0;i<71;i++){await page.keyboard.press('Shift+Tab');await visible();}
  await expect(first).toBeFocused();
});
