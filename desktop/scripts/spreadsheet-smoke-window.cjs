// Isolated renderer fixture; never opens the user's desktop profile.
const {app,BrowserWindow}=require('electron');
const origin=process.env.STUDYSPACE_SHEET_SMOKE_ORIGIN;
if(!origin||new URL(origin).hostname!=='127.0.0.1'||!process.env.STUDYSPACE_SHEET_SMOKE_PROFILE)throw Error('An isolated loopback origin and profile are required.');
app.setPath('userData',process.env.STUDYSPACE_SHEET_SMOKE_PROFILE);
app.whenReady().then(()=>{
  const window=new BrowserWindow({show:false,width:1440,height:1100,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.session.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
  window.loadURL(origin+'/demo?sample=1');
});
app.on('window-all-closed',()=>app.quit());
