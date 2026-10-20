"use client";
import type { CSSProperties } from "react";
import {
  noteHeadingPreset,
  noteHeadingPresets,
  type NoteHeadingFont,
} from "@/lib/note-typography";

export default function NoteHeadingSettings({
  value,
  onChange,
}: {
  value?: string;
  onChange: (value: NoteHeadingFont) => void;
}) {
  const selected = noteHeadingPreset(value);
  return (
    <fieldset className="note-heading-settings">
      <legend>Note titles &amp; headings</legend>
      <p>
        Choose a font style for note titles and headings. Changes apply
        immediately.
      </p>
      <div className="heading-font-options">
        {noteHeadingPresets.map((preset) => (
          <label
            key={preset.id}
            className={
              "heading-font-option" +
              (selected.id === preset.id ? " selected" : "")
            }
          >
            <input
              type="radio"
              name="note-heading-font"
              value={preset.id}
              checked={selected.id === preset.id}
              onChange={() => onChange(preset.id)}
              aria-label={preset.name}
            />
            <span className="heading-font-name">{preset.name}</span>
            <span
              className="heading-font-sample"
              aria-hidden="true"
              style={
                {
                  fontFamily: preset.family,
                  fontWeight: preset.weight,
                  letterSpacing: preset.tracking,
                } as CSSProperties
              }
            >
              Ideas worth keeping
            </span>
            <small>{preset.description}</small>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
