import { type Workspace, uid, now, inContainer } from "./model";
import { createContainer, createNote } from "./domain";
import { topicKey, type LearningTopic } from "./learning-catalog";
import { studyCodeBlocks } from "./code-blocks";
import { parseModule } from "./modules";
export interface LearningPath {
  id: string;
  topic: LearningTopic;
  rootId: string;
  createdAt: string;
  learnedAt?: string;
  concepts: {
    id: string;
    title: string;
    learned: boolean;
    learnedAt?: string;
  }[];
}
export interface LearnedEntry {
  id: string;
  title: string;
  category: string;
  kind: "Path" | "Concept";
  learnedAt: string;
  pathId?: string;
  noteId?: string;
  description?: string;
}
export function setPathLearned(path: LearningPath, learned: boolean) {
  path.learnedAt = learned ? now() : undefined;
  if (learned)
    for (const concept of path.concepts) {
      concept.learned = true;
      concept.learnedAt ??= path.learnedAt;
    }
}
export function learnedVault(w: Workspace): LearnedEntry[] {
  const entries: LearnedEntry[] = [];
  for (const path of w.settings.learningPaths ?? []) {
    if (!w.containers.some((c) => c.id === path.rootId && !c.trashed)) continue;
    if (path.learnedAt)
      entries.push({
        id: path.id,
        title: path.topic.title,
        category: path.topic.category,
        kind: "Path",
        learnedAt: path.learnedAt,
        pathId: path.id,
      });
    for (const c of path.concepts)
      if (
        c.learned &&
        !(path.learnedAt && topicKey(c.title) === topicKey(path.topic.title))
      )
        entries.push({
          id: c.id,
          title: c.title,
          category: path.topic.category,
          kind: "Concept",
          learnedAt: c.learnedAt ?? path.createdAt,
          pathId: path.id,
        });
  }
  for (const note of w.notes.filter((n) => !n.trashed && !n.archived))
    for (const block of studyCodeBlocks(note.body)) {
      if (block.language !== "module") continue;
      const data = parseModule(block.code);
      if (data?.kind !== "definition" || !data.learned || !data.term.trim())
        continue;
      const path = learningPathFor(w, note.containerId);
      entries.push({
        id: note.id + ":" + block.id,
        title: data.term,
        category: path?.topic.category ?? "From my notes",
        kind: "Concept",
        learnedAt: data.learnedAt ?? note.updatedAt,
        pathId: path?.id,
        noteId: note.id,
        description: data.explanation,
      });
    }
  return entries.sort((a, b) => b.learnedAt.localeCompare(a.learnedAt));
}
export function learningPathFor(w: Workspace, containerId: string) {
  return w.settings.learningPaths?.find((p) =>
    inContainer(w, containerId, p.rootId),
  );
}
export function eligibleTopics(topics: LearningTopic[], paths: LearningPath[]) {
  const keys = new Set(
    paths.flatMap((p) => [
      p.topic.id,
      topicKey(p.topic.title),
      ...(p.topic.sourceId ? ["wiki:" + p.topic.sourceId] : []),
    ]),
  );
  return topics.filter(
    (t) =>
      !keys.has(t.id) &&
      !keys.has(topicKey(t.title)) &&
      (!t.sourceId || !keys.has("wiki:" + t.sourceId)),
  );
}
export function startLearningPath(w: Workspace, topic: LearningTopic) {
  const paths = (w.settings.learningPaths ??= []);
  const prior = paths.find((p) => !eligibleTopics([topic], [p]).length);
  if (prior) {
    if (!w.containers.some((c) => c.id === prior.rootId && !c.trashed))
      throw Error(
        "This learning path is in Trash or missing. Restore its files before reopening it.",
      );
    w.settings.activeLearningPath = prior.id;
    return prior;
  }
  if (!topic.title.trim() || topic.title.length > 240)
    throw Error("Topic titles must contain 1–240 characters.");
  const root = createContainer(w, {
    title: topic.title,
    kind: "folder",
    icon: "graduation-cap",
    description: "Private learning path",
  });
  const path: LearningPath = {
    id: uid(),
    rootId: root.id,
    topic,
    createdAt: now(),
    concepts: [{ id: uid(), title: topic.title, learned: false }],
  };
  paths.push(path);
  w.settings.activeLearningPath = path.id;
  const source =
    topic.sourceUrl &&
    /^https:\/\/en\.wikipedia\.org\/wiki\//.test(topic.sourceUrl)
      ? topic.sourceUrl
      : "https://en.wikipedia.org/w/index.php?search=" +
        encodeURIComponent(topic.title);
  createNote(w, root.id, {
    title: "Learning journal",
    body: `# ${topic.title}\n\n## What I want to understand\n\n- \n\n## Notes and examples\n\n\n## Explain it in my own words\n\n\n## Questions to explore\n\n- \n\n## Starting point\n\n[Explore this topic on Wikipedia](${source})\n\nEvaluate sources and record the references you use.\n`,
  });
  return path;
}
