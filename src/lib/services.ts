export async function serviceCommand(action:string,data:Record<string,unknown>) {
 const response=await fetch("/api/collaboration",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,data})});
 const result=await response.json();if(!response.ok)throw Error(result.error);return result;
}
