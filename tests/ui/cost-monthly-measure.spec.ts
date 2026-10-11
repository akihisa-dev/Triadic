import { test, expect } from "@playwright/test";
test("製品用ReactとChromeで月別加算と初回表表示を比較する",async({page})=>{
 test.skip(!process.env.COST_MEASURE_DIR,"明示した性能確認でのみ実行します");test.setTimeout(120000);
 for(const [count,rows] of [[10,1],[100,10],[500,10]]){
  let previous="";
  for(const version of ["before","after"]){
   await page.goto(`${process.env.COST_MEASURE_DIR}/${version}.html?count=${count}&rows=${rows}`);
   await expect(page.getByRole("button",{name:"総原価表を表示"})).toBeVisible();
   const measured=await page.evaluate(()=>{
    const w=window as unknown as {runCost:()=>unknown;costObservation:{calls:number[]}};
    for(let i=0;i<5;i++)w.runCost();const start=w.costObservation.calls.length;
    for(let i=0;i<15;i++)w.runCost();return {times:w.costObservation.calls.slice(start),result:JSON.stringify(w.runCost())};
   });
   if(version==="before")previous=measured.result;else expect(measured.result).toBe(previous);
   const display=[];
   for(let i=0;i<6;i++){
    if(i){await page.reload();await expect(page.getByRole("button",{name:"総原価表を表示"})).toBeVisible();}
    const start=await page.evaluate(()=>performance.now());await page.getByRole("button",{name:"総原価表を表示"}).click();
    await expect(page.getByRole("table")).toBeVisible();await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    if(i)display.push(await page.evaluate(()=>performance.now())-start);
   }
   console.log("COST_MONTHLY "+JSON.stringify({count,rows,version,calculationMs:measured.times,extraMonthVisitsFromSource:version==="before" ? count!*rows!*144 : 0,displayMs:display,browser:await page.evaluate(()=>navigator.userAgent)}));
  }
 }
});
