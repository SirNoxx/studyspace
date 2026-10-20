"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, Eye, Pencil } from "lucide-react";
import { IconButton, Modal } from "./ui";
import { TaskPlanner } from "./CheckupPlanning";
import { uid } from "@/lib/model";
import {
  checkupTemplateSchema,
  fieldTypes,
  shiftDate,
  type CheckupAnswer,
  type CheckupDay,
  type CheckupField,
  type CheckupTemplate,
} from "@/lib/weekly-checkups";

export function CheckupInput({
  field,
  value,
  onChange,
  disabled = false,
  week,
}: {
  field: CheckupField;
  value?: CheckupAnswer;
  onChange: (value: CheckupAnswer) => void;
  disabled?: boolean;
  week: string;
}) {
  const controlId = `checkup-field-${field.id}`;
  const label = (
    <span className="checkup-label">
      {field.label}
      {field.required && <span className="checkup-required"> Required</span>}
    </span>
  );
  const hint = field.help && (
    <small id={controlId + "-help"}>{field.help}</small>
  );
  const common = {
    id: controlId,
    disabled,
    "aria-describedby": field.help ? controlId + "-help" : undefined,
    "aria-required": field.required,
  };
  if (field.type === "tasks")
    return (
      <fieldset className="checkup-field">
        <legend>{label}</legend>
        {hint}
        <TaskPlanner
          label={field.label}
          week={week}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      </fieldset>
    );
  if (field.type === "week") {
    const days: CheckupDay[] =
      Array.isArray(value) && typeof value[0] === "object"
        ? (value as CheckupDay[])
        : Array.from({ length: 7 }, () => ({
            focus: "",
            dinner: "",
            event: "",
          }));
    return (
      <fieldset className="checkup-field" disabled={disabled}>
        <legend>{label}</legend>
        {hint}
        <div className="checkup-day-grid">
          {days.map((day, index) => (
            <div className="checkup-day" key={index}>
              <h4>
                {
                  [
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                    "Sunday",
                  ][index]
                }{" "}
                <small>{shiftDate(week, index).slice(5)}</small>
              </h4>
              {(
                [
                  ["focus", "Daily focus"],
                  ["dinner", "Dinner plans"],
                  ["event", "Events & time"],
                ] as const
              ).map(([key, title]) => (
                <label key={key}>
                  <span>{title}</span>
                  <textarea
                    rows={2}
                    maxLength={4000}
                    aria-label={`${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][index]} ${title}`}
                    value={day[key]}
                    onChange={(e) =>
                      onChange(
                        days.map((d, i) =>
                          i === index ? { ...d, [key]: e.target.value } : d,
                        ),
                      )
                    }
                  />
                </label>
              ))}
            </div>
          ))}
        </div>
      </fieldset>
    );
  }
  if (field.type === "rating" || field.type === "checklist")
    return (
      <fieldset className="checkup-field" disabled={disabled}>
        <legend>{label}</legend>
        {hint}
        {field.type === "rating" ? (
          <div className="checkup-rating" role="group" aria-label={field.label}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${field.label}: ${n} of 5`}
                aria-pressed={value === n}
                onClick={() => onChange(value === n ? "" : n)}
              >
                {n}
              </button>
            ))}
            <span>
              {typeof value === "number" ? `${value} / 5` : "Not rated"}
            </span>
          </div>
        ) : (
          <div className="checkup-options">
            {field.options.map((option) => (
              <label key={option}>
                <input
                  type="checkbox"
                  checked={
                    Array.isArray(value) && value.some((v) => v === option)
                  }
                  onChange={(e) => {
                    const current = Array.isArray(value)
                      ? (value as string[])
                      : [];
                    onChange(
                      e.target.checked
                        ? [...current, option]
                        : current.filter((v) => v !== option),
                    );
                  }}
                />
                {option}
              </label>
            ))}
          </div>
        )}
      </fieldset>
    );
  return (
    <label className="checkup-field" htmlFor={controlId}>
      {label}
      {hint}
      {field.type === "textarea" ? (
        <textarea
          {...common}
          rows={4}
          maxLength={20000}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          {...common}
          type={field.type === "number" ? "number" : "text"}
          step={field.type === "number" ? "any" : undefined}
          maxLength={20000}
          value={
            typeof value === "string" || typeof value === "number" ? value : ""
          }
          onChange={(e) =>
            onChange(
              field.type === "number" && e.target.value !== ""
                ? Number(e.target.value)
                : e.target.value,
            )
          }
        />
      )}
    </label>
  );
}

export function TemplateBuilder({
  initial,
  onSave,
  onClose,
  week,
}: {
  initial: CheckupTemplate;
  onSave: (template: CheckupTemplate) => void;
  onClose: () => void;
  week: string;
}) {
  const [template, setTemplate] = useState<CheckupTemplate>(() =>
    JSON.parse(JSON.stringify(initial)),
  );
  const [preview, setPreview] = useState(false),
    [answers, setAnswers] = useState<Record<string, CheckupAnswer>>({}),
    [error, setError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const close = () =>
    JSON.stringify(template) === JSON.stringify(initial)
      ? onClose()
      : setConfirmClose(true);
  const updateSection = (
    id: string,
    change: Partial<CheckupTemplate["sections"][number]>,
  ) =>
    setTemplate((t) => ({
      ...t,
      sections: t.sections.map((s) => (s.id === id ? { ...s, ...change } : s)),
    }));
  const move = <T,>(values: T[], index: number, delta: number) => {
    const next = [...values];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    return next;
  };
  return (
    <Modal
      title="Form builder"
      description="Arrange sections and prompts to make this weekly meeting your own. Saved checkups keep their original form."
      wide
      onClose={close}
    >
      <div className="checkup-builder">
        <div className="checkup-actions">
          <button onClick={() => setPreview(!preview)}>
            {preview ? <Pencil size={15} /> : <Eye size={15} />}
            {preview ? "Edit form" : "Preview form"}
          </button>
          <span>
            {template.sections.length} sections ·{" "}
            {template.sections.reduce((n, s) => n + s.fields.length, 0)} prompts
          </span>
        </div>
        {preview ? (
          <>
            <h2>{template.name}</h2>
            <p>{template.description}</p>
            {template.sections.map((s) => (
              <section className="checkup-card" key={s.id}>
                <h3>{s.title}</h3>
                <p>{s.description}</p>
                {s.fields.map((f) => (
                  <CheckupInput
                    key={f.id}
                    field={f}
                    week={week}
                    value={answers[f.id]}
                    onChange={(value) =>
                      setAnswers((a) => ({ ...a, [f.id]: value }))
                    }
                  />
                ))}
              </section>
            ))}
          </>
        ) : (
          <>
            <label className="checkup-field">
              Template name
              <input
                maxLength={240}
                value={template.name}
                onChange={(e) =>
                  setTemplate((t) => ({ ...t, name: e.target.value }))
                }
              />
            </label>
            <label className="checkup-field">
              Description
              <textarea
                maxLength={1000}
                rows={2}
                value={template.description}
                onChange={(e) =>
                  setTemplate((t) => ({ ...t, description: e.target.value }))
                }
              />
            </label>
            {template.sections.map((s, index) => (
              <section
                key={s.id}
                className="checkup-card checkup-builder-section"
                aria-label={`Section ${index + 1}`}
              >
                <div className="checkup-actions">
                  <strong>Section {index + 1}</strong>
                  <IconButton
                    label="Move section up"
                    disabled={!index}
                    onClick={() =>
                      setTemplate((t) => ({
                        ...t,
                        sections: move(t.sections, index, -1),
                      }))
                    }
                  >
                    <ArrowUp size={15} />
                  </IconButton>
                  <IconButton
                    label="Move section down"
                    disabled={index === template.sections.length - 1}
                    onClick={() =>
                      setTemplate((t) => ({
                        ...t,
                        sections: move(t.sections, index, 1),
                      }))
                    }
                  >
                    <ArrowDown size={15} />
                  </IconButton>
                  <IconButton
                    label="Remove section"
                    disabled={template.sections.length === 1}
                    onClick={() =>
                      setTemplate((t) => ({
                        ...t,
                        sections: t.sections.filter((v) => v.id !== s.id),
                      }))
                    }
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </div>
                <label className="checkup-field">
                  Section title
                  <input
                    maxLength={240}
                    value={s.title}
                    onChange={(e) =>
                      updateSection(s.id, { title: e.target.value })
                    }
                  />
                </label>
                <label className="checkup-field">
                  Section guidance
                  <input
                    maxLength={1000}
                    value={s.description}
                    onChange={(e) =>
                      updateSection(s.id, { description: e.target.value })
                    }
                  />
                </label>
                <label className="checkup-field">
                  Segment experience
                  <select
                    aria-label="Segment experience"
                    value={s.layout ?? "reflection"}
                    onChange={(event) => {
                      const layout = event.target.value as NonNullable<
                        typeof s.layout
                      >;
                      const fields = [...s.fields];
                      const add = (
                        type: CheckupField["type"],
                        label: string,
                        money = false,
                      ) => {
                        if (
                          !fields.some((f) => f.type === type) &&
                          fields.length < 30
                        )
                          fields.push({
                            id: uid(),
                            label,
                            type,
                            help: "",
                            required: false,
                            options: [],
                            money,
                          });
                      };
                      if (layout === "tasks") {
                        add("tasks", "Tasks for the week");
                        add("week", "Daily focus & events");
                      }
                      if (layout === "meals") add("week", "Meals for the week");
                      if (layout === "finances") add("number", "Amount", true);
                      updateSection(s.id, { layout, fields });
                    }}
                  >
                    <option value="reflection">Guided reflection</option>
                    <option value="tasks">Calendar & task planning</option>
                    <option value="meals">Meal planner</option>
                    <option value="finances">Finance dashboard</option>
                  </select>
                </label>
                {s.fields.map((f, fi) => {
                  const update = (patch: Partial<CheckupField>) =>
                    updateSection(s.id, {
                      fields: s.fields.map((v) =>
                        v.id === f.id ? { ...v, ...patch } : v,
                      ),
                    });
                  return (
                    <div
                      key={f.id}
                      className="checkup-builder-prompt"
                      aria-label={`Prompt ${fi + 1}`}
                    >
                      <div className="checkup-actions">
                        <span>Prompt {fi + 1}</span>
                        <IconButton
                          label="Move prompt up"
                          disabled={!fi}
                          onClick={() =>
                            updateSection(s.id, {
                              fields: move(s.fields, fi, -1),
                            })
                          }
                        >
                          <ArrowUp size={14} />
                        </IconButton>
                        <IconButton
                          label="Move prompt down"
                          disabled={fi === s.fields.length - 1}
                          onClick={() =>
                            updateSection(s.id, {
                              fields: move(s.fields, fi, 1),
                            })
                          }
                        >
                          <ArrowDown size={14} />
                        </IconButton>
                        <IconButton
                          label="Remove prompt"
                          disabled={s.fields.length === 1}
                          onClick={() =>
                            updateSection(s.id, {
                              fields: s.fields.filter((v) => v.id !== f.id),
                            })
                          }
                        >
                          <Trash2 size={14} />
                        </IconButton>
                      </div>
                      <div className="checkup-two-columns">
                        <label className="checkup-field">
                          Prompt label
                          <input
                            maxLength={240}
                            value={f.label}
                            onChange={(e) => update({ label: e.target.value })}
                          />
                        </label>
                        <label className="checkup-field">
                          Response type
                          <select
                            value={f.type}
                            onChange={(e) =>
                              update({
                                type: e.target.value as CheckupField["type"],
                              })
                            }
                          >
                            {fieldTypes.map((type) => (
                              <option key={type} value={type}>
                                {
                                  {
                                    text: "Short answer",
                                    textarea: "Reflection",
                                    number: "Number / amount",
                                    rating: "Rating (1–5)",
                                    checklist: "Checklist",
                                    week: "Seven-day planner",
                                    tasks: "Task list",
                                  }[type]
                                }
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label className="checkup-field">
                        Helpful hint
                        <input
                          maxLength={1000}
                          value={f.help}
                          onChange={(e) => update({ help: e.target.value })}
                        />
                      </label>
                      {f.type === "number" && (
                        <label className="checkup-checkbox">
                          <input
                            type="checkbox"
                            checked={!!f.money}
                            onChange={(e) =>
                              update({ money: e.target.checked })
                            }
                          />
                          Use the checkup currency for this amount
                        </label>
                      )}
                      {f.type === "checklist" && (
                        <label className="checkup-field">
                          Options (one per line)
                          <textarea
                            rows={3}
                            value={f.options.join("\n")}
                            onChange={(e) =>
                              update({ options: e.target.value.split("\n") })
                            }
                          />
                        </label>
                      )}
                      <label className="checkup-checkbox">
                        <input
                          type="checkbox"
                          checked={f.required}
                          onChange={(e) =>
                            update({ required: e.target.checked })
                          }
                        />
                        Required to complete
                      </label>
                    </div>
                  );
                })}
                <button
                  disabled={s.fields.length >= 30}
                  onClick={() =>
                    updateSection(s.id, {
                      fields: [
                        ...s.fields,
                        {
                          id: uid(),
                          label: "New prompt",
                          help: "",
                          type: "textarea",
                          required: false,
                          options: [],
                        },
                      ],
                    })
                  }
                >
                  <Plus size={15} />
                  Add prompt
                </button>
              </section>
            ))}
            <button
              disabled={template.sections.length >= 16}
              onClick={() =>
                setTemplate((t) => ({
                  ...t,
                  sections: [
                    ...t.sections,
                    {
                      id: uid(),
                      title: "New section",
                      description: "",
                      fields: [
                        {
                          id: uid(),
                          label: "What would you like to reflect on?",
                          help: "",
                          type: "textarea",
                          required: false,
                          options: [],
                        },
                      ],
                    },
                  ],
                }))
              }
            >
              <Plus size={15} />
              Add section
            </button>
          </>
        )}
        {error && (
          <p role="alert" className="checkup-error">
            {error}
          </p>
        )}
        <div className="checkup-builder-footer">
          <button onClick={close}>Cancel</button>
          <button
            className="primary"
            onClick={() => {
              const result = checkupTemplateSchema.safeParse(template);
              if (!result.success) {
                setError(
                  "Give every section and prompt a name. Checklists need 1–30 unique, nonempty options.",
                );
                return;
              }
              onSave(result.data);
            }}
          >
            Save template
          </button>
        </div>
      </div>
      {confirmClose && (
        <Modal
          title="Discard template changes?"
          description="Your unsaved form edits will be discarded."
          onClose={() => setConfirmClose(false)}
        >
          <div className="checkup-actions">
            <button onClick={() => setConfirmClose(false)}>Keep editing</button>
            <button onClick={onClose}>Discard changes</button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
