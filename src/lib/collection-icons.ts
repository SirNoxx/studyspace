import { iconNames, type IconName } from "lucide-react/dynamic.mjs";
export const legacyCollectionIcons: Record<string, string> = {
  book: "book-open",
  code: "code-xml",
  graduation: "graduation-cap",
  pen: "pen-tool",
  game: "gamepad-2",
  inbox: "inbox",
  sigma: "sigma",
  folder: "folder",
  sparkles: "sparkles",
  library: "library",
};
const available = new Set<string>(iconNames);
export function collectionIconName(value: string): IconName | undefined {
  const name = value.startsWith("lucide:")
    ? value.slice(7)
    : (legacyCollectionIcons[value] ?? value);
  return available.has(name) ? (name as IconName) : undefined;
}
export const collectionIconLabel = (name: string) =>
  name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
const featured = [
  "book-open",
  "graduation-cap",
  "notebook-pen",
  "atom",
  "flask-conical",
  "dna",
  "brain",
  "calculator",
  "sigma",
  "code-xml",
  "terminal",
  "cpu",
  "database",
  "globe",
  "landmark",
  "languages",
  "palette",
  "music",
  "leaf",
  "rocket",
  "lightbulb",
  "microscope",
  "telescope",
  "library",
];
export const collectionIconNames = [
  ...featured.filter((n) => available.has(n)),
  ...iconNames.filter((n) => !featured.includes(n)).sort(),
];
