import {beforeAll,afterAll,it,expect} from "vitest";
import {randomUUID as uuid} from "node:crypto";
import {type PGlite} from "@electric-sql/pglite";
import {createTestDatabase,asDatabaseRole} from "./helpers/database";
let db:PGlite;
beforeAll(async()=>{db=await createTestDatabase();});afterAll(async()=>{await db?.close();});
async function actor(verified=true){const id=uuid(),email=id+"@example.com";await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)",[id,email,verified?new Date():null]);await db.query("insert into profiles(id,display_name) values($1,'Tester')",[id]);return {id,email};}
async function service(actor:{id:string},action:string,data={}){return asDatabaseRole(db,"authenticated",actor.id,async()=>{const r=await db.query<any>("select workspace_services($1,$2) value",[action,JSON.stringify(data)]);return r.rows[0].value;});}
it("email invitations accept only the verified intended account and preserve owner-only collection permissions",async()=>{
 const a=await actor(),b=await actor(),c=await actor();const collection=uuid();
 await asDatabaseRole(db,"authenticated",a.id,()=>db.query("select community_command('collection',$1,$2)",[JSON.stringify({title:"Shared"}),collection]));
 const id=uuid(),payload={id,kind:"collection",collection,email:b.email,role:"editor"};
 await service(a,"invite",payload);await service(a,"invite",payload);
 expect((await service(b,"list")).invitations).toHaveLength(1);
 expect((await service(c,"list")).invitations).toHaveLength(0);
 await expect(service(c,"invite",{...payload,id:uuid(),email:a.email})).rejects.toThrow("ACCESS_DENIED");
 await expect(service(c,"invitation",{id,status:"accepted"})).rejects.toThrow("INVITATION_REVOKED");
 await service(b,"invitation",{id,status:"accepted"});
 expect((await db.query<any>("select role from shared_members where collection_id=$1 and user_id=$2",[collection,b.id])).rows[0].role).toBe("editor");
 expect((await db.query("select id from email_outbox where id=$1",[id])).rows).toHaveLength(1);
 await asDatabaseRole(db,"authenticated",c.id,async()=>{await expect(db.query("select * from email_outbox")).rejects.toThrow("permission denied");await expect(db.query("select * from google_connections")).rejects.toThrow("permission denied");});
});
it("supports inviting future accounts, expiry and revocation",async()=>{
 const a=await actor(),email=uuid()+"@example.com",id=uuid();await service(a,"invite",{id,kind:"planner",email});
 const b=await actor(false);await db.query("update auth.users set email=$1 where id=$2",[email,b.id]);
 await expect(service(b,"list")).rejects.toThrow("EMAIL_VERIFICATION_REQUIRED");
 await db.query("update auth.users set email_confirmed_at=now() where id=$1",[b.id]);
 await service(a,"invitation",{id,status:"revoked"});
 await expect(service(b,"invitation",{id,status:"accepted"})).rejects.toThrow("INVITATION_REVOKED");
 const next=uuid();await service(a,"invite",{id:next,kind:"planner",email});await service(b,"invitation",{id:next,status:"accepted"});
 expect((await service(a,"list")).connections).toHaveLength(1);
});
it("protects shared tasks with accepted collaboration, revisions, owner deletion and revocation",async()=>{
 const a=await actor(),b=await actor(),c=await actor();const task={id:uuid(),assignee:b.id,title:"Review chapter",description:"Study",due_date:"2026-10-10",priority:"high"};
 await expect(service(a,"task-save",task)).rejects.toThrow("PLANNER_ACCEPTANCE_REQUIRED");
 const id=uuid();await service(a,"invite",{id,kind:"planner",email:b.email});await service(b,"invitation",{id,status:"accepted"});
 const saved=await service(a,"task-save",task);expect(saved.revision).toBe(1);
 expect((await service(b,"list")).tasks).toHaveLength(1);expect((await service(c,"list")).tasks).toHaveLength(0);
 await expect(service(c,"task-save",{...task,revision:1})).rejects.toThrow("ACCESS_DENIED");
 await service(b,"task-save",{...task,revision:1,completed:true});
 await expect(service(a,"task-save",{...task,revision:1})).rejects.toThrow("REVISION_CONFLICT");
 await expect(service(b,"task-delete",{id:task.id,revision:2})).rejects.toThrow("ACCESS_DENIED");
 await service(a,"disconnect",{target:b.id});expect((await service(b,"list")).tasks).toHaveLength(0);
 await expect(service(b,"task-save",{...task,revision:2})).rejects.toThrow("ACCESS_DENIED");
});
it("desktop handoffs require the verifier and are consumed exactly once",async()=>{
 const a=await actor();await db.query("insert into desktop_handoffs values('hash',$1,'challenge','encrypted',now()+interval '1 minute')",[a.id]);
 await asDatabaseRole(db,"authenticated",a.id,async()=>{await expect(db.query("select consume_desktop_handoff('hash','challenge')")).rejects.toThrow("permission denied");});
 await asDatabaseRole(db,"service_role",null,async()=>{
  expect((await db.query<any>("select consume_desktop_handoff('hash','wrong') v")).rows[0].v).toBeNull();
  expect((await db.query<any>("select consume_desktop_handoff('hash','challenge') v")).rows[0].v).toBe("encrypted");
  expect((await db.query<any>("select consume_desktop_handoff('hash','challenge') v")).rows[0].v).toBeNull();
 });
});
