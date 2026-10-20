export const noteHeadingPresets = [
  {
    id: "professional",
    name: "Professional",
    description: "Clear, restrained sans serif · Default",
    family: '"Segoe UI", system-ui, -apple-system, sans-serif',
    weight: 600,
    tracking: "-0.02em",
  },
  {
    id: "editorial",
    name: "Editorial",
    description: "An expressive, traditional serif",
    family: 'Georgia, "Times New Roman", serif',
    weight: 400,
    tracking: "-0.025em",
  },
  {
    id: "academic",
    name: "Academic",
    description: "Formal, book-style serif",
    family: 'Cambria, "Palatino Linotype", "Book Antiqua", serif',
    weight: 700,
    tracking: "-0.01em",
  },
  {
    id: "technical",
    name: "Technical",
    description: "Precise, evenly spaced lettering",
    family: 'Consolas, "SFMono-Regular", "Liberation Mono", monospace',
    weight: 600,
    tracking: "-0.03em",
  },
  {
    id: "friendly",
    name: "Friendly",
    description: "Softer, open sans serif",
    family: '"Trebuchet MS", Verdana, sans-serif',
    weight: 600,
    tracking: "0em",
  },
] as const;

export type NoteHeadingFont = (typeof noteHeadingPresets)[number]["id"];

export function noteHeadingPreset(value?: string) {
  return (
    noteHeadingPresets.find((preset) => preset.id === value) ??
    noteHeadingPresets[0]
  );
}

export function noteHeadingStyle(value?: string) {
  const preset = noteHeadingPreset(value);
  return {
    "--note-heading-font": preset.family,
    "--note-title-weight": preset.weight,
    "--note-title-tracking": preset.tracking,
  };
}
