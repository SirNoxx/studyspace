import { test, expect } from "@playwright/test";

test("retired planner and calendar links return to Collections", async ({ page }) => {
  for (const name of ["planner", "calendar"]) {
    await page.goto(`/demo/${name}?sample=1`);
    await expect(page.getByRole("tree", {name:"All collections",exact:true})).toBeVisible();
    await expect(page).toHaveURL(/\/demo\/$/);
    await expect(page.getByRole("button", {name:"Planner",exact:true})).toHaveCount(0);
    await expect(page.getByRole("button", {name:"Calendar",exact:true})).toHaveCount(0);
    await expect(page.getByRole("button", {name:"Connect account for community",exact:true})).toHaveCount(0);
  }
});

test("file manager uses the sidebar height and scrolls collection headings with files", async ({page}) => {
  await page.setViewportSize({width:1440,height:720});
  await page.goto("/demo?sample=1");
  await expect(page.getByRole("tree", {name:"All collections",exact:true})).toBeVisible();
  const collection = await page.evaluate(async () => {
    return await new Promise<{id:string;title:string}>((resolve,reject) => {
      const request=indexedDB.open("studyspace-device-v1");
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{
        const db=request.result, tx=db.transaction("workspaces","readwrite"), store=tx.objectStore("workspaces"), read=store.get("demo");
        let result:{id:string;title:string};
        read.onsuccess=()=>{
          const workspace=read.result, parent=workspace.containers.find((c:any)=>c.kind==="collection"&&!c.system);
          result={id:parent.id,title:parent.title};
          for(let i=0;i<60;i++)workspace.notes.push({...workspace.notes[0],id:crypto.randomUUID(),containerId:parent.id,kind:"note",title:`Scroll fixture ${String(i).padStart(2,"0")}`,body:"A scrolling fixture",order:100+i,history:[],trashed:false});
          store.put(workspace,"demo");
        };
        tx.oncomplete=()=>{db.close();resolve(result);};
        tx.onerror=()=>reject(tx.error);
      };
    });
  });
  await page.goto(`/demo/collection/${collection.id}`);
  const manager=page.getByRole("region",{name:"File manager",exact:true});
  const back=manager.getByRole("button",{name:"All Collections",exact:true});
  await expect(back).toBeInViewport();
  await expect(manager.locator('.focused-collection')).toContainText(collection.title);
  const height=await manager.evaluate(el=>el.clientHeight);
  expect(height).toBeGreaterThan(720*.75);
  await expect.poll(()=>manager.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
  const main=page.locator('.main-workspace');
  const mainTop=await main.evaluate(el=>el.scrollTop);
  await back.hover();
  await page.mouse.wheel(0,700);
  await expect.poll(()=>manager.evaluate(el=>el.scrollTop)).toBeGreaterThan(400);
  await expect(back).not.toBeInViewport();
  await expect(manager.locator('.focused-collection')).not.toBeInViewport();
  expect(await main.evaluate(el=>el.scrollTop)).toBe(mainTop);
  await manager.screenshot({path:'test-results/file-manager-scroll.png'});
  await page.mouse.wheel(0,10000);
  await expect(manager.getByRole('treeitem',{name:'Scroll fixture 59',exact:true})).toBeInViewport();
});
