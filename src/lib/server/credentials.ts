import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
function key() {
  const secret = process.env.INTEGRATION_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Integration encryption is not configured.");
  return createHash("sha256").update("studyspace-integrations-v1:"+secret).digest();
}
export function seal(value: unknown) {
  const iv=randomBytes(12), cipher=createCipheriv("aes-256-gcm",key(),iv);
  const data=Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),data]).toString("base64");
}
export function unseal<T>(value: string): T {
  const bytes=Buffer.from(value,"base64"),cipher=createDecipheriv("aes-256-gcm",key(),bytes.subarray(0,12));
  cipher.setAuthTag(bytes.subarray(12,28));
  return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString("utf8"));
}
export const hash = (value: string) => createHash("sha256").update(value).digest("base64url");
