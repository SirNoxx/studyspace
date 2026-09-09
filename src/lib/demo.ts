import { emptyWorkspace, uid, now } from "./model";
import {
  createContainer,
  createNote,
  addReview,
  reconcileSources,
} from "./domain";
export function sampleWorkspace() {
  const w = emptyWorkspace();
  w.settings.theme = "paper";
  w.settings.displayName = "Sample researcher";
  const coding = createContainer(w, {
    title: "Coding",
    icon: "code",
    color: "#739b8e",
    description: "Understanding the systems we build.",
  });
  const ai = createContainer(w, {
    title: "Artificial intelligence",
    parentId: coding.id,
    color: "#739b8e",
    icon: "sparkles",
  });
  const college = createContainer(w, {
    title: "College",
    icon: "graduation",
    color: "#b49a68",
    description: "A little more understanding, every day.",
  });
  const algebra = createContainer(w, {
    title: "Algebra",
    parentId: college.id,
    icon: "sigma",
    color: "#b49a68",
  });
  createContainer(w, {
    title: "Content Creation",
    icon: "pen",
    color: "#b48087",
  });
  createContainer(w, {
    title: "Game Development",
    icon: "game",
    color: "#9189b0",
  });
  const intro = createNote(w, ai.id, {
    title: "Tool calling",
    tags: ["ai", "fundamentals"],
    body: '# Tool calling\n\nGiving language models a way to work with the world.\n\n> [!NOTE] The big idea\n> A model can request a tool. Your application decides whether to run it, executes it, and returns the result.\n\n## Beyond generating text\n\nA language model is useful on its own, but its knowledge has boundaries. Tool calling connects a model to capabilities outside its training: looking up a document, checking the weather, or running a calculation.\n\nThe important distinction is between **requesting an action** and **executing an action**. The model proposes a structured request. Your application remains in control.\n\n## How the loop works\n\n1. Describe the available tools and their input schemas.\n2. Send the user’s question to the model.\n3. Validate the requested tool and its arguments.\n4. Run the tool with the user’s permissions.\n5. Return the result so the model can respond.\n\n```typescript\nconst result = await tools.search({\n  query: "How does retrieval work?"\n});\n```\n\n## A useful mental model\n\nThink of the model as a researcher at a desk. It can reason about a question, but sometimes needs to open a reference book. The tool is the book; your application is the librarian.\n\nThis connects naturally to [[Retrieval augmented generation|retrieval augmented generation]] and the idea of grounding answers in evidence.\n\n## Questions to explore\n\n- [x] Understand the request → execute → respond loop\n- [ ] Compare tool calling with structured output\n- [ ] Build a small retrieval tool\n\n---\n\n*Sample collection · You can edit or remove this material.*\n',
  });
  createNote(w, ai.id, {
    title: "Retrieval augmented generation",
    tags: ["ai", "retrieval"],
    body: "# Retrieval augmented generation\n\nRetrieval augmented generation combines a search step with a generation step. Relevant passages are supplied as context so an answer can be grounded in specific material.\n\n## Three stages\n\n1. Retrieve relevant passages.\n2. Supply them with stable references.\n3. Generate an answer and validate its citations.\n\nSee [[Tool calling]] for one way to request retrieval.\n\n> [!TIP] A retrieved URL is not evidence that the page was read. The actual passage must be available.\n",
  });
  createNote(w, coding.id, {
    title: "Learning roadmap",
    body: "# Learning roadmap\n\n## Foundations\n\n- [ ] Data structures\n- [ ] HTTP and web APIs\n- [ ] Testing and observability\n\n## This week\n\nBuild something small, understand it deeply, and write down what you learn.\n",
  });
  createNote(w, algebra.id, {
    title: "Functions & relationships",
    body: "# Functions & relationships\n\nA function maps each input to exactly one output.\n\n$$f(x) = 2x + 3$$\n\n| Input $x$ | Output $f(x)$ |\n| --- | --- |\n| 0 | 3 |\n| 1 | 5 |\n| 2 | 7 |\n\n## Try it\n\nWhat input produces an output of 11?\n",
  });
  for (const [term, definition] of [
    [
      "Tool calling",
      "A structured way for a language model to request an external capability. The application validates and executes the request, then returns the result.",
    ],
    [
      "Grounding",
      "Connecting an explanation to specific, available evidence rather than relying only on generated assertions.",
    ],
    [
      "Input schema",
      "A machine-readable description of the arguments accepted by a tool, including their types and constraints.",
    ],
  ])
    w.definitions.push({
      id: uid(),
      term,
      aliases: term === "Tool calling" ? ["function calling"] : [],
      definition,
      subjectIds: [ai.id],
      createdAt: now(),
      updatedAt: now(),
    });
  addReview(w, {
    front: "Who executes a tool call?",
    back: "The application executes the validated request. The model proposes it.",
    sourceType: "note",
    sourceId: intro.id,
    subjectId: ai.id,
  });
  reconcileSources(w, intro);
  return w;
}
