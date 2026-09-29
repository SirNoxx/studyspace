const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
(async()=>{
  const profile=path.join(root,'desktop/.smoke','checklist-'+Date.now());
  await fs.mkdir(profile,{recursive:true});
  await fs.writeFile(path.join(profile,'desktop-settings.json'),JSON.stringify({lastWorkspace:'local',automaticUpdates:false}));
  const env={...process.env,STUDYSPACE_SMOKE_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({executablePath:path.join(root,'desktop/release/win-unpacked/Studyspace.exe'),args:['--smoke-test'],env,timeout:60000});
  try {
    const page=await app.firstWindow();
    await page.waitForURL('http://127.0.0.1:47832/**',{timeout:60000});
    await page.goto('http://127.0.0.1:47832/demo?sample=1');
    const editor=page.getByRole('textbox',{name:'Markdown editor',exact:true});
    await editor.fill('[ ] Recruit creators\n[] Review work\n-[] Ship update\n\n- \\[ \\] Validate accounts');
    await expect(editor.getByRole('checkbox')).toHaveCount(4);
    await editor.getByRole('checkbox',{name:'Validate accounts',exact:true}).check();
    await page.getByRole('button',{name:'Source',exact:true}).click();
    await expect(editor).toContainText('- [x] Validate accounts');
    await editor.fill('');
    await page.getByRole('button',{name:'Live preview',exact:true}).click();
    await editor.evaluate(element=>{
      const data=new DataTransfer();
      data.setData('text/plain','12. Validate the experience\n[ ] Recruit creators\n[ ] Verify a complete journey');
      data.setData('text/html','<h1>12. Validate the experience</h1><ul><li><p>[ ] Recruit creators</p></li><li><p>[ ] Verify a complete journey</p></li></ul>');
      element.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
    });
    await expect(editor.getByRole('checkbox')).toHaveCount(2);
    await editor.getByRole('checkbox',{name:'Recruit creators',exact:true}).check();
    await page.getByRole('button',{name:'Source',exact:true}).click();
    await expect(editor).not.toContainText('\\[');
    await expect(editor).not.toContainText('\\]');
    await expect(editor).toContainText('- [x] Recruit creators');
    await page.getByRole('button',{name:'Reading',exact:true}).click();
    await expect(page.locator('.writing-area').getByRole('checkbox')).toHaveCount(2);
    await expect(page.locator('.writing-area').getByRole('checkbox').first()).toBeChecked();
    await page.getByRole('button',{name:'Live preview',exact:true}).click();
    await expect(page.locator('.save-state')).toContainText('Saved on this device');
    await page.reload();
    await expect(editor.getByRole('checkbox').first()).toBeChecked();
    const ratio=await page.locator('.document').evaluate(el=>el.getBoundingClientRect().width/el.parentElement.clientWidth);
    expect(ratio).toBeCloseTo(.9,2);
    console.log('PASS: actual packaged app renders existing bare/escaped tasks, rich clipboard tasks have no bracket escapes, checks persist through Reading and reload, note width is 90% of its pane.');
  }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
