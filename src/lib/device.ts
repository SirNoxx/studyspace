export interface CloudAccount {id:string;email?:string}
declare global {interface Window {studyspaceDevice?:{signIn:()=>Promise<void>;signOut:()=>Promise<void>}}}
export async function connectAccount() {
 if(window.studyspaceDevice)await window.studyspaceDevice.signIn();
 else location.assign("/auth?next=/demo");
}
