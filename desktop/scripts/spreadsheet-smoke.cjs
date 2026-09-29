const {_electron:electron,expect}=require('@playwright/test');
const path=require('node:path'),fs=require('node:fs/promises'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
(async()=>{
  const profile=path.join(root,'test-results','spreadsheet-electron-'+Date.now());await fs.mkdir(profile,{recursive:true});
  const env={...process.env,STUDYSPACE_SHEET_SMOKE_PROFILE:profile,STUDYSPACE_SHEET_SMOKE_ORIGIN:process.env.E2E_BASE_URL||'http://127.0.0.1:3177'};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'spreadsheet-smoke-window.cjs')],env,timeout:60000});
  try{
    const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await page.getByRole('textbox',{name:'Markdown editor',exact:true}).fill('```module studyspace:desktop-sheet\n'+JSON.stringify({version:1,kind:'spreadsheet',workbookId:require('node:crypto').randomUUID()})+'\n```');
    const module=page.locator('.spreadsheet-module');await expect(module.getByRole('grid')).toBeVisible({timeout:90000});
    await module.getByLabel('Spreadsheet cell text or formula').fill('=SUM(4,6)');await module.getByRole('button',{name:'Apply cell value',exact:true}).click();
    await expect(module.getByRole('gridcell',{name:'A1: 10',exact:true})).toBeVisible();await expect(module.getByRole('status')).toHaveText('Saved on this device');
    await page.reload();await expect(module.getByRole('gridcell',{name:'A1: 10',exact:true})).toBeVisible({timeout:60000});
    assert.deepEqual(await page.evaluate(()=>({node:typeof window.require,process:typeof window.process})),{node:'undefined',process:'undefined'});
    assert.deepEqual(errors,[]);console.log('PASS: sandboxed Electron renderer, external network blocked, formulas and durable reload. This is a runtime smoke test, not an installer certification.');
  }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
