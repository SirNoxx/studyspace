import {z} from "zod";
import {PublicationInput} from "./server/publish";
const id=z.uuid(),short=z.string().max(500),date=z.iso.datetime({offset:true});
export const DeviceSnapshot=PublicationInput.shape.fields.extend({
  version:z.number().int().positive(),author:short,createdAt:date,
  folderCount:z.number().int().min(0).max(10000).optional(),
  notes:z.array(z.object({id,title:z.string().max(240),body:z.string().max(3000000),path:z.string().max(4000),revision:z.number().int().positive()})).min(1).max(500),
  definitions:z.array(z.object({id,term:short,aliases:z.array(short).max(100),definition:z.string().max(50000),subjectIds:z.array(id).max(0),noteId:id.optional(),createdAt:date,updatedAt:date})).max(1000),
  sources:z.array(z.object({id,input:z.string().max(2048),canonical:z.string().max(2048),title:short,authors:z.array(short).max(100),kind:z.enum(["url","doi","arxiv","isbn","pdf"]),subjectIds:z.array(id).max(0),noteIds:z.array(id).max(500),manual:z.boolean(),overrides:z.array(short).max(0),status:z.enum(["pending","ready","partial","error"]),publisher:short.optional(),date:short.optional(),provider:short.optional(),error:short.optional(),retrievedAt:short.optional(),attachmentId:id.optional(),createdAt:date})).max(1000),
  anchors:z.array(z.object({id,sourceId:id,noteId:id.optional(),noteRevision:z.number().int().optional(),quote:z.string().max(50000),prefix:z.literal(""),suffix:z.literal(""),locator:z.string().max(2000),contentHash:short.optional(),page:z.number().int().min(0).optional(),rotation:z.number().optional(),rects:z.array(z.object({x:z.number(),y:z.number(),width:z.number(),height:z.number()})).max(500).optional(),state:z.enum(["attached","changed","unresolved"])})).max(1000),
  annotations:z.array(z.object({id,noteId:id,revision:z.number().int(),quote:z.string().max(50000),prefix:z.literal(""),suffix:z.literal(""),body:z.string().max(50000),kind:z.literal("author"),createdAt:date,state:z.enum(["attached","changed"]),publicationId:id.optional(),versionId:id.optional()})).max(1000),
  attachments:z.array(z.object({id,filename:z.string().min(1).max(500),mime:z.string().regex(/^[\w.+-]+\/[\w.+-]+$/),size:z.number().int().min(0).max(50*1024*1024),hash:z.string().regex(/^[0-9a-f]{64}$/),key:z.literal(""),createdAt:date})).max(20).default([]),
  lineage:z.array(z.object({publicationId:id,version:z.number().int().positive(),title:short,author:short})).max(100),
}).superRefine((s,ctx)=>{
  if(s.attachments.reduce((total,a)=>total+a.size,0)>128*1024*1024)ctx.addIssue({code:"custom",message:"Select at most 128 MB of attachments per publication."});
  const notes=new Set(s.notes.map(n=>n.id)),assets=new Set(s.attachments.map(a=>a.id)),sources=new Set(s.sources.map(a=>a.id));
  if(notes.size!==s.notes.length||assets.size!==s.attachments.length||s.annotations.some(a=>!notes.has(a.noteId))||s.anchors.some(a=>!sources.has(a.sourceId)||a.noteId&&!notes.has(a.noteId))||s.sources.some(a=>a.noteIds.some(n=>!notes.has(n))||a.attachmentId&&!assets.has(a.attachmentId)))ctx.addIssue({code:"custom",message:"The publication contains an invalid selection reference."});
});
