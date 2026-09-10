import type { JournalTemplate } from "./model";

export interface StudyspaceTemplate extends JournalTemplate {
  category: string;
  description: string;
  motif:
    | "sunrise"
    | "anchor"
    | "flame"
    | "compass"
    | "code"
    | "sprout"
    | "orbit"
    | "mountain"
    | "book"
    | "moon";
  color: string;
}

// Bundled originals are public resources, independent of member publications.
// Keep identities stable: saved copies reference these IDs across app updates.
export const studyspaceTemplates: StudyspaceTemplate[] = [
  {
    id: "e190a401-435a-48dc-9a10-000000000001",
    title: "Daybreak Compass",
    kind: "journal",
    author: "Studyspace",
    category: "Daily planning",
    description:
      "Set a direction for the day with one priority, an energy check, and a realistic plan.",
    motif: "sunrise",
    color: "#b87732",
    body: `# Daybreak Compass

> A small plan for a day that matters.

## Check the weather
**Energy / 5:** … · **Mood:** … · **Time available:** …

What is taking up space in my mind?

## My north star
The one thing that would make today worthwhile:

**I will know it is done when:**

## Three stepping stones
- [ ] First small action:
- [ ] Main study session:
- [ ] One thing for life outside studying:

| When | What I will work on | Enough for today looks like |
| --- | --- | --- |
| Morning | | |
| Afternoon | | |
| Evening | | |

## Leave room
**A likely interruption:**

**My smaller backup plan:**

**Something I am looking forward to:**
`,
  },
  {
    id: "e190a401-435a-48dc-9a10-000000000002",
    title: "Deep Work Dock",
    kind: "journal",
    author: "Studyspace",
    category: "Focus",
    description:
      "Plan one focused session, park distractions, and leave a clear place to restart.",
    motif: "anchor",
    color: "#497eac",
    body: `# Deep Work Dock

## Before I begin
**Task:**

**Session length:** … · **Start:** … · **Stop:** …

**The concrete result I want:**

- [ ] Gather only the materials I need.
- [ ] Silence avoidable interruptions.
- [ ] Choose the first action, small enough to start now.

## Working space
Write the reasoning, calculations, or rough draft here.

## Distraction parking
Capture it once; decide what to do after the session.

| Thought or interruption | Follow up later? |
| --- | --- |
| | |
| | |

## Dock the session
**What I finished:**

**What slowed me down:**

**Exact next action for my next session:**

**Break I will take now:**
`,
  },
  {
    id: "e190a401-435a-48dc-9a10-000000000003",
    title: "Recall Forge",
    kind: "journal",
    author: "Studyspace",
    category: "Learning",
    description:
      "Recall a topic from memory, compare it with your sources, and turn gaps into questions.",
    motif: "flame",
    color: "#b95e49",
    body: `# Recall Forge

**Topic:** … · **Source or lesson:** …

## Close the source
Without looking at my notes, explain the idea in plain language:

**An example I can invent:**

**A case where this idea would not apply:**

## Open and compare
Now check against the source. Keep the original attempt above.

| What I recalled | Correction or missing detail | Why it matters |
| --- | --- | --- |
| | | |
| | | |
| | | |

## Put it under pressure
1. **Recall:** What are the essential parts?
2. **Apply:** How would I use this in a new situation?
3. **Explain:** Why does it work, and what assumption could fail?

## Next retrieval
**Question I still cannot answer:**

**Next review date:**

- [ ] Explain it again without the source.
- [ ] Check the explanation and revise any gaps.
`,
  },
  {
    id: "e190a401-435a-48dc-9a10-000000000004",
    title: "Paper Trail",
    kind: "journal",
    author: "Studyspace",
    category: "Research",
    description:
      "Trace a research question through claims, evidence, limitations, and the next investigation.",
    motif: "compass",
    color: "#78894b",
    body: `# Paper Trail

## The question
What am I trying to find out, and why?

**Working explanation before reading:**

## Source passport
**Title:**

**Author / organization:**

**Date:** … · **Link / DOI:** … · **Pages or section:** …

## Evidence ledger
Use quotation marks for exact quotations; label my own paraphrases.

| Claim | Evidence and precise location | Limitation or uncertainty |
| --- | --- | --- |
| | | |
| | | |

## My interpretation
**What this changes about my understanding:**

**What this source does not establish:**

**A conflicting explanation worth checking:**

## Follow the trail
- [ ] Find an independent source for:
- [ ] Investigate the unanswered question:
- [ ] Update my working explanation:
`,
  },
  {
    id: "e190a401-435a-48dc-9a10-000000000005",
    title: "Debug Diary",
    kind: "journal",
    author: "Studyspace",
    category: "Coding",
    description:
      "Turn a confusing bug into a reproducible case, tested hypotheses, and a reusable lesson.",
    motif: "code",
    color: "#8171b4",
    body: `# Debug Diary

## Bug report to myself
**Expected behavior:**

**Actual behavior:**

**Environment / version:**

## Smallest reproduction
1. Starting state:
2. Action:
3. Observed result:

**Relevant code, input, or error message:**

## Hypothesis lab
Change one thing at a time and record the result.

| Hypothesis | Experiment | Result | Keep or reject? |
| --- | --- | --- | --- |
| | | | |
| | | | |

## The explanation
**Root cause and evidence:**

**Fix and why it works:**

## Prove it stays fixed
- [ ] Original reproduction now passes.
- [ ] A nearby edge case still works.
- [ ] Add an appropriate regression check.

**Pattern I will recognize next time:**
`,
  },
  {
    id: "e190a401-435a-48dc-9a10-000000000006",
    title: "Idea Greenhouse",
    kind: "journal",
    author: "Studyspace",
    category: "Creativity",
    description:
      "Grow a rough idea by connecting it to something familiar and trying a tiny experiment.",
    motif: "sprout",
    color: "#518e78",
    body: `# Idea Greenhouse

## Plant the seed
The raw idea, however unfinished:

**What sparked it:**

**Who or what it could help:**

## Cross-pollinate
**An idea from another subject that connects:**

**What if I combined them?**

**What if I reversed my main assumption?**

## Give it shape
| Version | What makes it interesting | Main constraint |
| --- | --- | --- |
| Simple | | |
| Unexpected | | |
| Ambitious | | |

## A tiny experiment
**The smallest thing I can make or try:**

**Time or resources I will allow:**

**What result would make me continue?**

## After the experiment
**What happened:**

**Keep growing, change direction, or let it rest? Why?**
`,
  },
  {
    id: "e190a401-435a-48dc-9a10-000000000007",
    title: "Weekly Orbit",
    kind: "journal",
    author: "Studyspace",
    category: "Weekly review",
    description:
      "Review a week of learning, notice patterns, and choose a sustainable plan for the next one.",
    motif: "orbit",
    color: "#567a9e",
    body: `# Weekly Orbit

**Week of:**

## Look back
**A win worth keeping:**

**Something that surprised me:**

**An unfinished task I can release or reschedule:**

## Learning map
| Subject or project | What moved forward | What needs attention |
| --- | --- | --- |
| | | |
| | | |
| | | |

## Find the pattern
**What gave me energy:**

**What repeatedly got in the way:**

**One adjustment supported by what I noticed:**

## Set the next orbit
1. Most meaningful priority:
2. Maintenance task:
3. Something restorative:

**Time I actually have available:**

**One thing I will deliberately leave out:**
`,
  },
  {
    id: "e190a401-435a-48dc-9a10-000000000008",
    title: "Exam Expedition",
    kind: "journal",
    author: "Studyspace",
    category: "Exam preparation",
    description:
      "Map the syllabus, prioritize weak areas, and learn from practice mistakes before exam day.",
    motif: "mountain",
    color: "#9a7852",
    body: `# Exam Expedition

**Exam:** … · **Date:** … · **Format:** …

## Map the terrain
Use the syllabus or official learning objectives to check coverage.

| Topic | Confidence / 5 | Evidence from practice | Next action |
| --- | --- | --- | --- |
| | | | |
| | | | |
| | | | |

## Choose today's route
**Highest-priority gap:**

**Practice task and time limit:**

**What I must do without looking at notes:**

## Mistake log
| Question or skill | Why I missed it | Correct reasoning | Retry date |
| --- | --- | --- | --- |
| | | | |
| | | | |

## Base-camp checklist
- [ ] Check the time, place, and permitted materials.
- [ ] Revisit errors using fresh questions.
- [ ] Leave room for breaks and sleep.

**My next manageable step:**
`,
  },
  {
    id: "e190a401-435a-48dc-9a10-000000000009",
    title: "Commonplace Cabinet",
    kind: "journal",
    author: "Studyspace",
    category: "Reading",
    description:
      "Collect a passage, preserve its source, and connect the idea to your own questions and work.",
    motif: "book",
    color: "#9e6883",
    body: `# Commonplace Cabinet

## Label the drawer
**Book, article, talk, or conversation:**

**Creator:** … · **Page / timestamp:** … · **Link:** …

**Topic tags:**

## Keep the passage
> Paste a short quotation here, or write a clearly labeled paraphrase.

## Make it mine
**In my own words:**

**Why I stopped at this idea:**

**Where I agree, disagree, or need more context:**

## Connect the drawers
| Related idea or note | The connection |
| --- | --- |
| | |
| | |

## Put it to use
**A situation where this might help:**

**A question this leaves me with:**

**One sentence I want to remember:**
`,
  },
  {
    id: "e190a401-435a-48dc-9a10-000000000010",
    title: "Evening Landing",
    kind: "journal",
    author: "Studyspace",
    category: "Reflection",
    description:
      "Close the day gently: notice what happened, acknowledge effort, and set down tomorrow's worries.",
    motif: "moon",
    color: "#7777ad",
    body: `# Evening Landing

## Touch down
**How I feel right now:**

**The day in three words:**

## Three moments
1. A moment I appreciated:
2. A moment that challenged me:
3. A moment I want to remember:

## Acknowledge the effort
**Something I tried, even if it did not work:**

**What I learned about the task or myself:**

**What I would say to a friend in the same position:**

## Set it down
| Still on my mind | One next step, or permission to leave it |
| --- | --- |
| | |
| | |

## A gentle handoff
**The first small thing for tomorrow:**

**Something that can wait:**

**How I will rest tonight:**
`,
  },
];

export function browseStudyspaceTemplates(
  kind: JournalTemplate["kind"],
  query = "",
) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return studyspaceTemplates.filter((t) => {
    const searchable =
      `${t.title} ${t.description} ${t.category}`.toLocaleLowerCase();
    return t.kind === kind && words.every((word) => searchable.includes(word));
  });
}
