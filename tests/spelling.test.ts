import {it,expect} from "vitest";
import {wordAtPosition,isSpellingWord} from "../src/lib/spelling";
it("targets complete words and contractions without swallowing punctuation or adjacent words",()=>{
 const text="First sentnce. Second sentnce. don't";
 expect(wordAtPosition(text,8)).toEqual({from:6,to:13,word:"sentnce"});
 expect(wordAtPosition(text,24)).toEqual({from:22,to:29,word:"sentnce"});
 expect(wordAtPosition(text,33)?.word).toBe("don't");
 expect(wordAtPosition(text,15)?.word).toBe("Second");
 expect(isSpellingWord("two words")).toBe(false);expect(isSpellingWord("a".repeat(49))).toBe(false);
});
