export type ID = string;
export type NoteKind = "note" | "quick" | "journal" | "dream";
export type Theme =
  | "system"
  | "light"
  | "dark"
  | "paper"
  | "winter"
  | "spring"
  | "summer"
  | "fall"
  | "tropical"
  | "underwater"
  | "space"
  | "forest";
export interface Container {
  id: ID;
  parentId: ID | null;
  kind: "collection" | "subject" | "folder";
  title: string;
  description: string;
  color: string;
  icon: string;
  approach: string;
  dictionary: boolean;
  related: ID[];
  order: number;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
  trashed?: boolean;
  system?: "general";
}
export interface Revision {
  revision: number;
  title: string;
  body: string;
  at: string;
  reason: string;
}
export interface Note {
  id: ID;
  containerId: ID;
  title: string;
  body: string;
  kind: NoteKind;
  revision: number;
  createdAt: string;
  updatedAt: string;
  history: Revision[];
  tags: string[];
  trashed?: boolean;
  archived?: boolean;
  originalPath?: string;
  journalDate?: string;
  timezone?: string;
  metadata?: Record<string, unknown>;
  linkMap?: Record<string, ID>;
}
export interface Definition {
  noteId?: ID;
  id: ID;
  term: string;
  aliases: string[];
  definition: string;
  subjectIds: ID[];
  createdAt: string;
  updatedAt: string;
  trashed?: boolean;
}
export interface Source {
  id: ID;
  input: string;
  canonical: string;
  title: string;
  authors: string[];
  kind: "url" | "doi" | "arxiv" | "isbn" | "pdf";
  subjectIds: ID[];
  noteIds: ID[];
  manual: boolean;
  overrides: string[];
  status: "pending" | "ready" | "partial" | "error";
  description?: string;
  publisher?: string;
  date?: string;
  provider?: string;
  error?: string;
  retrievedAt?: string;
  attachmentId?: ID;
  createdAt: string;
}
export interface Anchor {
  id: ID;
  sourceId: ID;
  noteId?: ID;
  noteRevision?: number;
  quote: string;
  prefix: string;
  suffix: string;
  locator: string;
  contentHash?: string;
  page?: number;
  rotation?: number;
  rects?: { x: number; y: number; width: number; height: number }[];
  state: "attached" | "changed" | "unresolved";
}
export interface Attachment {
  id: ID;
  filename: string;
  mime: string;
  size: number;
  hash: string;
  key: string;
  createdAt: string;
  trashed?: boolean;
}
export interface Annotation {
  id: ID;
  noteId: string;
  revision: number;
  quote: string;
  prefix: string;
  suffix: string;
  body: string;
  kind: "private" | "author";
  createdAt: string;
  state: "attached" | "changed";
  publicationId?: ID;
  versionId?: ID;
}
export type Grade = "again" | "hard" | "good" | "easy";
export interface Schedule {
  algorithm: "studyspace-1";
  state: "new" | "learning" | "review" | "relearning";
  interval: number;
  ease: number;
  repetitions: number;
  lapses: number;
  due: string;
}
export interface ReviewItem {
  groupId?: ID;
  id: ID;
  front: string;
  back: string;
  sourceId?: ID;
  sourceRevision?: number;
  sourceType: "definition" | "note" | "citation" | "custom";
  subjectId?: ID;
  schedule: Schedule;
  suspended: boolean;
  contentChanged?: boolean;
  createdAt: string;
  events: { id: ID; grade: Grade; at: string; before: Schedule }[];
}
export interface PublicNote {
  id: ID;
  title: string;
  body: string;
  path: string;
  revision: number;
}
export interface Snapshot {
  category?: string;
  studyMethod?: string;
  folderCount?: number;
  popularity?: number;
  id: ID;
  publicationId: ID;
  version: number;
  title: string;
  description: string;
  author: string;
  topics: string[];
  notes: PublicNote[];
  definitions: Definition[];
  sources: Source[];
  anchors: Anchor[];
  annotations: Annotation[];
  attachments?: Attachment[];
  createdAt: string;
  summary: string;
  allowCopies: boolean;
  allowDownload: boolean;
  allowQA: boolean;
  lineage: LineageNode[];
}
export interface LineageNode {
  publicationId: ID;
  version: number;
  title: string;
  author: string;
}
export interface LocalPublication {
  id: ID;
  containerId: ID;
  current: Snapshot;
  versions: Snapshot[];
  status: "published" | "unpublished";
}
export interface StudyCopy {
  id: ID;
  containerId: ID;
  publicationId: ID;
  baseline: Snapshot;
  mapping: Record<string, string>;
  accepted: Record<string, PublicNote | null>;
  lineage: LineageNode[];
  acceptedRecords?: Record<
    string,
    { kind: string; data: Record<string, unknown> } | null
  >;
  mergeCheckpoint?: {
    at: string;
    mapping: Record<string, string>;
    accepted: Record<string, PublicNote | null>;
    acceptedRecords?: StudyCopy["acceptedRecords"];
    baseline: Snapshot;
    records: Pick<
      Workspace,
      "notes" | "definitions" | "sources" | "anchors" | "attachments"
    >;
  };
}
export interface Notification {
  id: ID;
  title: string;
  body: string;
  href?: string;
  read: boolean;
  createdAt: string;
}
export interface AIRecord {
  chatId?: ID;
  question?: string;
  scope?: "selection" | "note" | "subject";
  responseStyle?: string;
  id: ID;
  noteId: ID;
  revision: number;
  action: string;
  output: string;
  createdAt: string;
  selection?: string;
  quiz?: {
    question: string;
    answer: string;
    response?: string;
    revealed?: boolean;
    assessment?: "missed" | "understood";
  }[];
  evidence?: { id: string; text: string; title?: string; locator?: string }[];
}
export interface Settings {
  journalTemplates?: JournalTemplate[];
  workspaceName?: string;
  ribbonCompact?: boolean;
  toolsCompact?: boolean;
  chatHidden?: boolean;
  onboardingComplete?: boolean;
  dismissedIntroductions?: Record<string, boolean>;
  cardGroups?: { id: ID; title: string; containerId?: ID }[];
  theme: Theme;
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  fullWidth: boolean;
  coloredRows: boolean;
  autoCapture: boolean;
  autoEnrich: boolean;
  remoteImages: boolean;
  dictionaryDensity: "all" | "paragraph" | "note";
  timezone: string;
  newCap: number;
  reviewCap: number;
  notifications: boolean;
  aiConsent: boolean;
  defaultMode: "source" | "live" | "reading";
  shortcuts: Record<string, string>;
  journalTemplate: string;
  dreamTemplate: string;
  displayName: string;
  bio: string;
}
export interface JournalTemplate {
  id: ID;
  title: string;
  body: string;
  kind: "journal" | "dream";
  publicId?: ID;
  publishedId?: ID;
  author?: string;
}
export interface Workspace {
  schemaVersion: 1;
  revision: number;
  containers: Container[];
  notes: Note[];
  definitions: Definition[];
  sources: Source[];
  anchors: Anchor[];
  attachments: Attachment[];
  annotations: Annotation[];
  review: ReviewItem[];
  publications: LocalPublication[];
  copies: StudyCopy[];
  bookmarks: string[];
  progress: Record<string, string[]>;
  notifications: Notification[];
  ai: AIRecord[];
  settings: Settings;
}
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const defaultSettings: Settings = {
  theme: "system",
  fontSize: 16,
  lineHeight: 1.7,
  fontFamily: "sans",
  fullWidth: false,
  coloredRows: false,
  autoCapture: true,
  autoEnrich: true,
  remoteImages: false,
  dictionaryDensity: "paragraph",
  timezone: "America/Los_Angeles",
  newCap: 20,
  reviewCap: 100,
  notifications: true,
  aiConsent: false,
  defaultMode: "live",
  shortcuts: {
    palette: "Mod+p",
    switcher: "Mod+o",
    dictionary: "Mod+Shift+d",
    search: "Mod+Shift+f",
    quick: "Mod+Shift+q",
    zen: "Mod+Shift+z",
  },
  journalTemplate:
    "## Intentions\n\n\n## Reflections\n\n\n## What I learned\n\n",
  dreamTemplate:
    "## The dream\n\n\n## Details I remember\n\n\n## Reflection\n\n",
  displayName: "Researcher",
  bio: "",
};
export function emptyWorkspace(): Workspace {
  const at = now();
  return {
    schemaVersion: 1,
    revision: 0,
    containers: [
      {
        id: uid(),
        parentId: null,
        kind: "collection",
        title: "General",
        description: "A place to begin.",
        color: "#8d98a3",
        icon: "inbox",
        approach: "mixed",
        dictionary: false,
        related: [],
        order: 0,
        system: "general",
        createdAt: at,
        updatedAt: at,
      },
    ],
    notes: [],
    definitions: [],
    sources: [],
    anchors: [],
    attachments: [],
    annotations: [],
    review: [],
    publications: [],
    copies: [],
    bookmarks: [],
    progress: {},
    notifications: [],
    ai: [],
    settings: {
      ...defaultSettings,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  };
}
export function ancestry(w: Workspace, id: ID): Container[] {
  const result: Container[] = [];
  const seen = new Set<string>();
  let c = w.containers.find((c) => c.id === id);
  while (c && !seen.has(c.id)) {
    seen.add(c.id);
    result.unshift(c);
    c = w.containers.find((x) => x.id === c!.parentId);
  }
  return result;
}
export const rootOf = (w: Workspace, id: ID) => ancestry(w, id)[0];
export const inContainer = (w: Workspace, child: ID, parent: ID) =>
  ancestry(w, child).some((c) => c.id === parent);
export const subjectOf = (w: Workspace, id: ID) =>
  ancestry(w, id)
    .reverse()
    .find((c) => c.kind !== "folder");
export const general = (w: Workspace) =>
  w.containers.find((c) => c.system === "general")!;
export function contextDefinitions(w: Workspace, containerId: ID) {
  const scopes = ancestry(w, containerId)
    .reverse()
    .filter((c) => c.kind !== "folder");
  const seen = new Set<string>();
  return scopes.flatMap((c) =>
    w.definitions
      .filter((d) => !d.trashed && d.subjectIds.includes(c.id))
      .filter((d) => {
        const key = d.term.normalize("NFKC").toLocaleLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
  );
}
export function localDate(timezone: string, at = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}
