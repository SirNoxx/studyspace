import { diffChars } from "diff";
import {studyCodeBlocks} from "./code-blocks";

export interface AttachmentPlacement {
  body: string;
  position: number;
  replaceBlockId?: string;
}

/** Keep the original paste point while uploads finish and the note is edited. */
export function placeAttachment(
  current: string,
  placement: AttachmentPlacement | undefined,
  markdown: string,
) {
  let position = current.length;
  let end: number | undefined;
  if(placement?.replaceBlockId) {
    const original=studyCodeBlocks(placement.body).find(b=>b.id===placement.replaceBlockId);
    const block=studyCodeBlocks(current).find(b=>b.id===placement.replaceBlockId);
    if(!original || !block || placement.body.slice(original.from,original.to)!==current.slice(block.from,block.to))
      throw Error("The PDF module changed during import. Please import it again.");
    position=block.from;end=block.to;
  } else if (placement) {
    const changes = diffChars(placement.body, current, { timeout: 100 });
    if (!changes)
      throw Error(
        "The note changed too much during upload. Insert the attachment again.",
      );
    let before = 0,
      after = 0;
    position = 0;
    for (const change of changes) {
      if (before >= placement.position) {
        position = after;
        break;
      }
      if (change.added) after += change.value.length;
      else if (change.removed) {
        if (before + change.value.length >= placement.position) {
          position = after;
          break;
        }
        before += change.value.length;
      } else {
        if (before + change.value.length >= placement.position) {
          position = after + placement.position - before;
          break;
        }
        before += change.value.length;
        after += change.value.length;
      }
      position = after;
    }
  }
  const insert =
    (position > 0 && current[position - 1] !== "\n" ? "\n" : "") +
    markdown +
    "\n";
  const body = current.slice(0, position) + insert + current.slice(end ?? position);
  return { body, placement: { body, position: position + insert.length } };
}
