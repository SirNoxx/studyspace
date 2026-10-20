import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { moduleText } from "./modules";
import { parseBoard } from "./whiteboard";
export async function documentToMarkdown(bytes:Uint8Array,extension:string) {
 if(extension==="txt")return {markdown:new TextDecoder("utf-8",{fatal:true}).decode(bytes),warnings:[] as string[]};
 if(extension==="docx") {
  const [{default:mammoth},{default:Turndown},{gfm},{default:DOMPurify}]=await Promise.all([import("mammoth"),import("turndown"),import("turndown-plugin-gfm"),import("dompurify")]);
  const result=await mammoth.convertToHtml({arrayBuffer:Uint8Array.from(bytes).buffer},{externalFileAccess:false});
  const clean=DOMPurify.sanitize(result.value,{USE_PROFILES:{html:true}});
  const converter=new Turndown({headingStyle:"atx",codeBlockStyle:"fenced"});converter.use(gfm);
  const markdown=converter.turndown(clean);if(!markdown.trim())throw Error("No text was found in this Word document. The original is retained.");
  return {markdown,warnings:result.messages.map(m=>m.message)};
 }
 if(extension==="pdf") {
  const pdfjs=await import("pdfjs-dist");pdfjs.GlobalWorkerOptions.workerSrc="/pdf.worker.min.mjs";
  const task=pdfjs.getDocument({data:Uint8Array.from(bytes)});
  const pdf=await task.promise;try {
   if(pdf.numPages>200)throw Error("PDF conversion is limited to 200 pages. Split this PDF first.");
   const pages=[],warnings=[];let found=false;
   for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i),content=await page.getTextContent();let text="";
    for(const item of content.items)if("str" in item)text+=item.str+(item.hasEOL?"\n":" ");
    if(text.trim())found=true;else warnings.push(`Page ${i} has no extractable text and may need OCR.`);
    pages.push(`## Page ${i}\n\n${text.trim() || "[Image-only page: OCR required]"}`);
   }
   if(!found)throw Error("This PDF has no extractable text. Use OCR first; its original file is retained.");
   return {markdown:pages.join("\n\n"),warnings:["PDF text was converted in reading order. Review columns, tables, equations and page breaks.",...warnings]};
  }finally{await task.destroy();}
 }
 throw Error("Convert older .doc files to .docx before importing.");
}
function plain(node:any):string{return node.value ?? (node.children ?? []).map(plain).join("");}
export async function wordDocument(title:string,markdown:string) {
 const d=await import("docx");const tree=unified().use(remarkParse).use(remarkGfm).parse(markdown);
 const inline=(nodes:any[],style:any={}):any[]=>nodes.flatMap(n=>{
  if(n.type==="strong")return inline(n.children,{...style,bold:true});
  if(n.type==="emphasis")return inline(n.children,{...style,italics:true});
  if(n.type==="link" && /^https?:\/\//i.test(n.url))return [new d.ExternalHyperlink({link:n.url,children:[new d.TextRun({text:plain(n),style:"Hyperlink"})]})];
  return [new d.TextRun({text:plain(n),...style,...(n.type==="inlineCode"?{font:"Consolas"}:{})})];
 });
 const blocks=(nodes:any[],level=0):any[]=>nodes.flatMap(n=>{
  if(n.type==="heading")return [new d.Paragraph({heading:([d.HeadingLevel.HEADING_1,d.HeadingLevel.HEADING_2,d.HeadingLevel.HEADING_3,d.HeadingLevel.HEADING_4,d.HeadingLevel.HEADING_5,d.HeadingLevel.HEADING_6])[n.depth-1],children:inline(n.children)})];
  if(n.type==="list")return n.children.flatMap((item:any,i:number)=>[new d.Paragraph({children:[new d.TextRun((item.checked==null?(n.ordered?`${(n.start ?? 1)+i}. `:"• "):item.checked?"☑ ":"☐ ")+plain(item.children[0]))],indent:{left:360*(level+1)}}),...blocks(item.children.slice(1),level+1)]);
  if(n.type==="table")return [new d.Table({width:{size:100,type:d.WidthType.PERCENTAGE},rows:n.children.map((row:any)=>new d.TableRow({children:row.children.map((cell:any)=>new d.TableCell({children:[new d.Paragraph({children:inline(cell.children)})]}))}))})];
  if(n.type==="code") {
   let text=n.value;if(n.lang==="module")text=moduleText(n.value);if(n.lang==="whiteboard")text="Whiteboard\n"+(parseBoard(n.value)?.strokes.filter(s=>s.tool==="text").map(s=>s.text).join("\n") || "Drawing: use PDF export to preserve the visual.");
   return text.split("\n").map((line:string)=>new d.Paragraph({children:[new d.TextRun({text:line,font:n.lang==="module"?"Arial":"Consolas",size:20})]}));
  }
  if(n.type==="blockquote")return blocks(n.children,level+1);
  if(n.type==="thematicBreak")return [new d.Paragraph("────────────────")];
  return [new d.Paragraph({children:inline(n.children ?? [n]),spacing:{after:120}})];
 });
 return d.Packer.toBlob(new d.Document({title,sections:[{children:[new d.Paragraph({text:title,heading:d.HeadingLevel.TITLE}),...blocks(tree.children)]}]}));
}
