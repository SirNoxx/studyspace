"use client";
import { useMemo, useState, useEffect } from "react";
import {
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  Trash2,
  Save,
  BookOpen,
  FolderInput,
  Globe,
  Plus,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { Menu } from "./ui";
import {
  parseModule,
  chartCandles,
  validCandle,
  type ChartData,
  type ModuleData,
} from "@/lib/modules";
import type { StudyCodeBlock, BlockAction } from "@/lib/code-blocks";

const chartColors = [
  "#527e69",
  "#678eb5",
  "#b38757",
  "#9576ae",
  "#be7380",
  "#649a9d",
];
function ChartValue({
  value,
  label,
  onChange,
}: {
  value: number;
  label: string;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <input
      type="number"
      aria-label={label}
      min={-1e9}
      max={1e9}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const number = Number(e.target.value);
        if (
          e.target.value !== "" &&
          Number.isFinite(number) &&
          Math.abs(number) <= 1e9
        )
          onChange(number);
      }}
      onBlur={() => setDraft(String(value))}
    />
  );
}
function Chart({ data }: { data: Extract<ModuleData, { kind: "chart" }> }) {
  if (data.style === "candlestick") return <CandlestickChart data={data} />;
  const values = data.rows.map((r) => r.value),
    low = Math.min(0, ...values),
    high = Math.max(1, ...values),
    span = high - low;
  const y = (v: number) => 210 - ((v - low) / span) * 180;
  let angle = -Math.PI / 2;
  const sum = values.reduce((a, b) => a + Math.max(0, b), 0);
  return (
    <>
      <svg
        className="module-chart"
        viewBox="0 0 640 260"
        role="img"
        aria-label={`${data.style} chart: ${data.rows.map((r) => `${r.label} ${r.value}`).join(", ")}`}
      >
        {data.style === "pie" ? (
          sum === 0 ? (
            <text x="320" y="130" textAnchor="middle">
              Add positive values to draw a pie chart.
            </text>
          ) : (
            data.rows
              .filter((r) => r.value > 0)
              .map((r, i) => {
                const start = angle;
                angle += (r.value / sum) * Math.PI * 2;
                return r.value === sum ? (
                  <circle
                    key={i}
                    cx="320"
                    cy="130"
                    r="100"
                    fill={chartColors[i % chartColors.length]}
                  />
                ) : (
                  <path
                    key={i}
                    d={`M320 130 L${320 + 100 * Math.cos(start)} ${130 + 100 * Math.sin(start)} A100 100 0 ${angle - start > Math.PI ? 1 : 0} 1 ${320 + 100 * Math.cos(angle)} ${130 + 100 * Math.sin(angle)} Z`}
                    fill={chartColors[i % chartColors.length]}
                  />
                );
              })
          )
        ) : (
          <>
            <line
              x1="45"
              x2="620"
              y1={y(0)}
              y2={y(0)}
              stroke="currentColor"
              opacity=".3"
            />
            <text
              x="40"
              y={y(high)}
              textAnchor="end"
              fontSize="11"
              fill="currentColor"
            >
              {high}
            </text>
            <text
              x="40"
              y={y(low) + 4}
              textAnchor="end"
              fontSize="11"
              fill="currentColor"
            >
              {low}
            </text>
            {data.style === "line" && (
              <polyline
                points={data.rows
                  .map(
                    (r, i) =>
                      `${60 + ((i + 0.5) * 540) / data.rows.length},${y(r.value)}`,
                  )
                  .join(" ")}
                fill="none"
                stroke={chartColors[0]}
                strokeWidth="3"
              />
            )}
            {data.rows.map((r, i) => {
              const x = 60 + ((i + 0.5) * 540) / data.rows.length;
              return (
                <g key={i}>
                  {data.style === "bar" ? (
                    <rect
                      x={x - 170 / data.rows.length}
                      y={Math.min(y(0), y(r.value))}
                      width={340 / data.rows.length}
                      height={Math.max(1, Math.abs(y(r.value) - y(0)))}
                      rx="3"
                      fill={chartColors[i % chartColors.length]}
                    />
                  ) : (
                    <circle
                      cx={x}
                      cy={y(r.value)}
                      r="4"
                      fill={chartColors[0]}
                    />
                  )}
                  <text
                    x={x}
                    y={r.value >= 0 ? y(r.value) - 7 : y(r.value) + 15}
                    fontSize="11"
                    textAnchor="middle"
                    fill="currentColor"
                  >
                    {r.value}
                  </text>
                  <text
                    x={x}
                    y="244"
                    fontSize="11"
                    textAnchor="middle"
                    fill="currentColor"
                  >
                    {r.label.slice(0, 12)}
                  </text>
                </g>
              );
            })}
          </>
        )}
      </svg>
      {data.style === "pie" && (
        <div className="chart-legend">
          {data.rows
            .filter((r) => r.value > 0)
            .map((r, i) => (
              <span key={i}>
                <i
                  style={{ background: chartColors[i % chartColors.length] }}
                />
                {r.label}: {r.value}
              </span>
            ))}
          {values.some((v) => v < 0) && (
            <small>
              Pie charts show positive values only. Use a bar or line chart for
              negative values.
            </small>
          )}
        </div>
      )}
    </>
  );
}
function CandlestickChart({ data }: { data: ChartData }) {
  const candles = chartCandles(data),
    valid = candles.filter(validCandle);
  const min = valid.length ? Math.min(...valid.map((c) => c.low)) : 0,
    max = valid.length ? Math.max(...valid.map((c) => c.high)) : 1;
  const padding = Math.max(
      (max - min) * 0.1,
      Math.max(Math.abs(max), 1) * 0.01,
    ),
    bottom = min - padding,
    top = max + padding;
  const y = (value: number) => 215 - ((value - bottom) / (top - bottom)) * 185;
  return (
    <>
      <div
        className="candlestick-plot-scroll"
        tabIndex={0}
        aria-label="Candlestick chart scroll area"
      >
        <svg
          className="candlestick-plot"
          style={{ minWidth: Math.max(420, candles.length * 76) }}
          viewBox={`0 0 ${Math.max(640, candles.length * 90)} 280`}
          role="img"
          aria-label={`Candlestick chart: ${candles.map((c) => `${c.label}, open ${c.open}, high ${c.high}, low ${c.low}, close ${c.close}${validCandle(c) ? "" : " (invalid range)"}`).join("; ")}`}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const value = bottom + (top - bottom) * t;
            return (
              <g key={t}>
                <line
                  x1="68"
                  x2={Math.max(640, candles.length * 90) - 15}
                  y1={y(value)}
                  y2={y(value)}
                  stroke="currentColor"
                  opacity=".12"
                />
                <text
                  x="60"
                  y={y(value) + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="currentColor"
                >
                  {Number(value.toPrecision(4))}
                </text>
              </g>
            );
          })}
          {candles.map((c, i) => {
            const slot =
                (Math.max(640, candles.length * 90) - 90) / candles.length,
              x = 75 + (i + 0.5) * slot,
              width = Math.min(32, slot * 0.5),
              color = c.close >= c.open ? "#489877" : "#cc7384";
            return (
              <g key={i} data-candlestick={i + 1}>
                <title>{`${c.label}: Open ${c.open}; High ${c.high}; Low ${c.low}; Close ${c.close}`}</title>
                {validCandle(c) ? (
                  <>
                    <line
                      x1={x}
                      x2={x}
                      y1={y(c.high)}
                      y2={y(c.low)}
                      stroke={color}
                      strokeWidth="2"
                    />
                    <rect
                      x={x - width / 2}
                      y={Math.min(y(c.open), y(c.close))}
                      width={width}
                      height={Math.max(2, Math.abs(y(c.open) - y(c.close)))}
                      fill={color}
                      rx="2"
                    />
                  </>
                ) : (
                  <text x={x} y="130" textAnchor="middle" fill="currentColor">
                    !
                  </text>
                )}
                <text
                  x={x}
                  y="244"
                  textAnchor="middle"
                  fontSize="11"
                  fill="currentColor"
                >
                  {c.label.length > 14 ? c.label.slice(0, 13) + "…" : c.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="chart-legend">
        <span>
          <i style={{ background: "#489877" }} />
          Close ≥ open
        </span>
        <span>
          <i style={{ background: "#cc7384" }} />
          Close &lt; open
        </span>
      </div>
      {!valid.length && (
        <p className="chart-help">
          Set a valid high and low to display your candlesticks.
        </p>
      )}
    </>
  );
}
export default function NoteModule({
  block,
  onChange,
  onAction,
  readOnly = false,
}: {
  block: StudyCodeBlock;
  onChange?: (patch: Partial<StudyCodeBlock>) => void;
  onAction?: (action: BlockAction) => void;
  readOnly?: boolean;
}) {
  const data = useMemo(() => parseModule(block.code), [block.code]);
  const update = (next: ModuleData) =>
    onChange?.({ code: JSON.stringify(next) });
  const field = (
    label: string,
    value: string,
    change: (value: string) => void,
    placeholder = "",
  ) => (
    <label className="module-field">
      <span>{label}</span>
      {readOnly ? (
        <div className="module-text">{value || "—"}</div>
      ) : (
        <textarea
          aria-label={label}
          value={value}
          maxLength={20000}
          placeholder={placeholder}
          onChange={(e) => change(e.target.value)}
        />
      )}
    </label>
  );
  if (!data)
    return (
      <div className="module-invalid">
        This module could not be read. Its original content is preserved in
        Source mode.
      </div>
    );
  let content: React.ReactNode;
  switch (data.kind) {
    case "cornell":
      content = (
        <div className="cornell-module">
          <div>
            {field(
              "Cues & questions",
              data.cues,
              (cues) => update({ ...data, cues }),
              "Key terms, questions, and prompts…",
            )}
          </div>
          <div>
            {field(
              "Notes",
              data.notes,
              (notes) => update({ ...data, notes }),
              "Record explanations and examples…",
            )}
          </div>
          <div className="cornell-summary">
            {field(
              "Summary",
              data.summary,
              (summary) => update({ ...data, summary }),
              "Explain the main idea in your own words…",
            )}
          </div>
        </div>
      );
      break;
    case "paper":
      content = (
        <>
          <div className="module-controls">
            {!readOnly && (
              <label>
                Paper style
                <select
                  aria-label="Paper style"
                  value={data.style}
                  onChange={(e) =>
                    update({
                      ...data,
                      style: e.target.value as typeof data.style,
                    })
                  }
                >
                  <option value="ruled">Ruled</option>
                  <option value="plain">Plain</option>
                  <option value="grid">Grid</option>
                </select>
              </label>
            )}
          </div>
          <div className={"module-paper paper-" + data.style}>
            {field(
              "Writing",
              data.text,
              (text) => update({ ...data, text }),
              "Start writing…",
            )}
          </div>
        </>
      );
      break;
    case "table":
      content = (
        <>
          <div className="module-table-scroll">
            <table className="module-table">
              <thead>
                <tr>
                  {data.headers.map((h, c) => (
                    <th key={c}>
                      {readOnly ? (
                        h
                      ) : (
                        <input
                          aria-label={`Column ${c + 1} heading`}
                          value={h}
                          maxLength={20000}
                          onChange={(e) =>
                            update({
                              ...data,
                              headers: data.headers.map((v, i) =>
                                i === c ? e.target.value : v,
                              ),
                            })
                          }
                        />
                      )}
                    </th>
                  ))}
                  {!readOnly && <th aria-label="Row actions" />}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((value, c) => (
                      <td key={c}>
                        {readOnly ? (
                          <div className="module-text">{value}</div>
                        ) : (
                          <textarea
                            aria-label={`Row ${r + 1}, column ${c + 1}`}
                            value={value}
                            maxLength={20000}
                            onChange={(e) =>
                              update({
                                ...data,
                                rows: data.rows.map((row, i) =>
                                  i === r
                                    ? row.map((v, j) =>
                                        j === c ? e.target.value : v,
                                      )
                                    : row,
                                ),
                              })
                            }
                          />
                        )}
                      </td>
                    ))}
                    {!readOnly && (
                      <td>
                        <button
                          aria-label={`Delete row ${r + 1}`}
                          onClick={() =>
                            update({
                              ...data,
                              rows: data.rows.filter((_, i) => i !== r),
                            })
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!readOnly && (
            <div className="module-controls">
              <button
                disabled={data.rows.length >= 100}
                onClick={() =>
                  update({
                    ...data,
                    rows: [...data.rows, data.headers.map(() => "")],
                  })
                }
              >
                <Plus size={14} />
                Add row
              </button>
              <button
                disabled={data.headers.length >= 12}
                onClick={() =>
                  update({
                    ...data,
                    headers: [...data.headers, "Column"],
                    rows: data.rows.map((r) => [...r, ""]),
                  })
                }
              >
                <Plus size={14} />
                Add column
              </button>
            </div>
          )}
        </>
      );
      break;
    case "venn":
      content = (
        <>
          <div
            className="venn-diagram"
            role="img"
            aria-label={`${data.left} and ${data.right} overlap`}
          >
            <svg viewBox="0 0 600 260" aria-hidden="true">
              <circle
                cx="235"
                cy="130"
                r="112"
                fill="#527e692b"
                stroke="#527e69"
                strokeWidth="2"
              />
              <circle
                cx="365"
                cy="130"
                r="112"
                fill="#678eb52b"
                stroke="#678eb5"
                strokeWidth="2"
              />
            </svg>
            <div className="venn-labels">
              <strong>{data.left}</strong>
              <span>Shared</span>
              <strong>{data.right}</strong>
            </div>
          </div>
          <div className="venn-fields">
            {field("Topic A", data.left, (left) => update({ ...data, left }))}
            {field("Shared ideas", data.shared, (shared) =>
              update({ ...data, shared }),
            )}
            {field("Topic B", data.right, (right) =>
              update({ ...data, right }),
            )}
            {field("Only in A", data.leftOnly, (leftOnly) =>
              update({ ...data, leftOnly }),
            )}
            <div />
            {field("Only in B", data.rightOnly, (rightOnly) =>
              update({ ...data, rightOnly }),
            )}
          </div>
        </>
      );
      break;
    case "chart":
      content = (
        <>
          {readOnly && <Chart data={data} />}
          {!readOnly && (
            <>
              <div className="module-controls">
                <label>
                  Chart type
                  <select
                    aria-label="Chart type"
                    value={data.style}
                    onChange={(e) =>
                      update({
                        ...data,
                        style: e.target.value as typeof data.style,
                        ...(e.target.value === "candlestick"
                          ? { candles: chartCandles(data) }
                          : {}),
                      })
                    }
                  >
                    <option value="bar">Bar</option>
                    <option value="line">Line</option>
                    <option value="pie">Pie</option>
                    <option value="candlestick">Candlestick</option>
                  </select>
                </label>
              </div>
              <Chart data={data} />
              {data.style === "candlestick" ? (
                <>
                  <p className="chart-help">
                    Label each candle and set its open, high, low, and close.
                    Changes save automatically.
                  </p>
                  <div className="candle-editors">
                    {chartCandles(data).map((c, i) => (
                      <fieldset className="candle-editor" key={i}>
                        <legend>Candlestick {i + 1}</legend>
                        <div className="candle-heading">
                          <label>
                            Label
                            <input
                              aria-label={`Candlestick label ${i + 1}`}
                              value={c.label}
                              maxLength={20000}
                              onChange={(e) =>
                                update({
                                  ...data,
                                  candles: chartCandles(data).map((r, j) =>
                                    i === j
                                      ? { ...r, label: e.target.value }
                                      : r,
                                  ),
                                })
                              }
                            />
                          </label>
                          <button
                            aria-label={`Delete candlestick ${i + 1}`}
                            disabled={chartCandles(data).length === 1}
                            onClick={() =>
                              update({
                                ...data,
                                candles: chartCandles(data).filter(
                                  (_, j) => j !== i,
                                ),
                              })
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        <div className="candle-values">
                          {(["open", "high", "low", "close"] as const).map(
                            (key) => (
                              <label key={key}>
                                {key[0].toUpperCase() + key.slice(1)}
                                <ChartValue
                                  label={`Candlestick ${i + 1} ${key}`}
                                  value={c[key]}
                                  onChange={(value) =>
                                    update({
                                      ...data,
                                      candles: chartCandles(data).map((r, j) =>
                                        i === j ? { ...r, [key]: value } : r,
                                      ),
                                    })
                                  }
                                />
                              </label>
                            ),
                          )}
                        </div>
                        {!validCandle(c) && (
                          <p className="candle-error" role="status">
                            High must be at least the open and close; low must
                            be at most both. Adjust the values to draw this
                            candle.
                          </p>
                        )}
                      </fieldset>
                    ))}
                  </div>
                  <div className="module-controls">
                    <button
                      disabled={chartCandles(data).length >= 24}
                      onClick={() =>
                        update({
                          ...data,
                          candles: [
                            ...chartCandles(data),
                            {
                              label: `Candle ${chartCandles(data).length + 1}`,
                              open: 0,
                              high: 1,
                              low: 0,
                              close: 1,
                            },
                          ],
                        })
                      }
                    >
                      <Plus size={14} />
                      Add candlestick
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="chart-data">
                    <div className="chart-data-heading">
                      <span>Label</span>
                      <span>Value</span>
                      <span />
                    </div>
                    {data.rows.map((row, i) => (
                      <div key={i}>
                        <input
                          aria-label={`Chart label ${i + 1}`}
                          value={row.label}
                          maxLength={20000}
                          onChange={(e) =>
                            update({
                              ...data,
                              rows: data.rows.map((r, j) =>
                                j === i ? { ...r, label: e.target.value } : r,
                              ),
                            })
                          }
                        />
                        <ChartValue
                          label={`Chart value ${i + 1}`}
                          value={row.value}
                          onChange={(value) => {
                            update({
                              ...data,
                              rows: data.rows.map((r, j) =>
                                j === i ? { ...r, value } : r,
                              ),
                            });
                          }}
                        />
                        <button
                          aria-label={`Delete chart value ${i + 1}`}
                          disabled={data.rows.length === 1}
                          onClick={() =>
                            update({
                              ...data,
                              rows: data.rows.filter((_, j) => j !== i),
                            })
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="module-controls">
                    <button
                      disabled={data.rows.length >= 24}
                      onClick={() =>
                        update({
                          ...data,
                          rows: [...data.rows, { label: "New", value: 0 }],
                        })
                      }
                    >
                      <Plus size={14} />
                      Add value
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </>
      );
      break;
    case "list":
      content = (
        <>
          {!readOnly && (
            <div className="module-controls">
              <label>
                List style
                <select
                  aria-label="List style"
                  value={data.style}
                  onChange={(e) =>
                    update({
                      ...data,
                      style: e.target.value as typeof data.style,
                    })
                  }
                >
                  <option value="bullets">Bullets</option>
                  <option value="numbered">Numbered</option>
                  <option value="todo">To-do</option>
                </select>
              </label>
            </div>
          )}
          <div className="module-list">
            {data.items.map((item, i) => (
              <div
                key={i}
                className={
                  item.done && data.style === "todo" ? "completed" : ""
                }
              >
                {data.style === "todo" ? (
                  <input
                    type="checkbox"
                    aria-label={`Complete task ${i + 1}`}
                    checked={item.done}
                    disabled={readOnly}
                    onChange={(e) =>
                      update({
                        ...data,
                        items: data.items.map((v, j) =>
                          j === i ? { ...v, done: e.target.checked } : v,
                        ),
                      })
                    }
                  />
                ) : (
                  <span>{data.style === "numbered" ? `${i + 1}.` : "•"}</span>
                )}
                {readOnly ? (
                  <span className="module-text">{item.text}</span>
                ) : (
                  <>
                    <textarea
                      aria-label={`List item ${i + 1}`}
                      value={item.text}
                      maxLength={20000}
                      placeholder="Write an item…"
                      onChange={(e) =>
                        update({
                          ...data,
                          items: data.items.map((v, j) =>
                            j === i ? { ...v, text: e.target.value } : v,
                          ),
                        })
                      }
                    />
                    <button
                      aria-label={`Delete list item ${i + 1}`}
                      onClick={() =>
                        update({
                          ...data,
                          items: data.items.filter((_, j) => j !== i),
                        })
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          {!readOnly && (
            <div className="module-controls">
              <button
                disabled={data.items.length >= 100}
                onClick={() =>
                  update({
                    ...data,
                    items: [...data.items, { text: "", done: false }],
                  })
                }
              >
                <Plus size={14} />
                Add item
              </button>
            </div>
          )}
        </>
      );
      break;
    case "calendar": {
      const [year, month] = data.month.split("-").map(Number),
        first = new Date(year, month - 1, 1),
        days = new Date(year, month, 0).getDate();
      const changeMonth = (delta: number) => {
        const date = new Date(year, month - 1 + delta, 1);
        if (date.getFullYear() >= 1000 && date.getFullYear() <= 9999)
          update({
            ...data,
            month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
          });
      };
      content = (
        <>
          <div className="module-controls calendar-controls">
            {!readOnly && (
              <button
                aria-label="Previous month"
                onClick={() => changeMonth(-1)}
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <strong>
              {first.toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </strong>
            {!readOnly && (
              <>
                <input
                  type="month"
                  aria-label="Calendar month"
                  min="1000-01"
                  max="9999-12"
                  value={data.month}
                  onChange={(e) => {
                    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value))
                      update({ ...data, month: e.target.value });
                  }}
                />
                <button aria-label="Next month" onClick={() => changeMonth(1)}>
                  <ArrowRight size={16} />
                </button>
              </>
            )}
          </div>
          <div className="module-calendar-scroll">
            <div className="module-calendar">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <strong className="calendar-weekday" key={d}>
                  {d}
                </strong>
              ))}
              {Array.from({ length: first.getDay() }, (_, i) => (
                <div key={"empty" + i} />
              ))}
              {Array.from({ length: days }, (_, i) => {
                const day = `${data.month}-${String(i + 1).padStart(2, "0")}`;
                return (
                  <div className="calendar-day" key={day}>
                    <span>{i + 1}</span>
                    {readOnly ? (
                      <div className="module-text">{data.entries[day]}</div>
                    ) : (
                      <textarea
                        aria-label={`Notes for ${day}`}
                        maxLength={20000}
                        value={data.entries[day] ?? ""}
                        onChange={(e) =>
                          update({
                            ...data,
                            entries: { ...data.entries, [day]: e.target.value },
                          })
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      );
      break;
    }
  }
  return (
    <section
      className={"note-module note-module-" + data.kind}
      aria-label={`${data.kind} module`}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <header className="module-heading">
        {!readOnly && (
          <button
            aria-label={block.collapsed ? "Expand module" : "Collapse module"}
            aria-expanded={!block.collapsed}
            onClick={() => onChange?.({ collapsed: !block.collapsed })}
          >
            {block.collapsed ? (
              <ChevronRight size={16} />
            ) : (
              <ChevronDown size={16} />
            )}
          </button>
        )}
        {readOnly ? (
          <strong>{block.title}</strong>
        ) : (
          <input
            aria-label="Module title"
            maxLength={120}
            value={block.title ?? ""}
            onChange={(e) => onChange?.({ title: e.target.value })}
          />
        )}{" "}
        {!readOnly && onAction && (
          <Menu
            trigger={
              <button aria-label="Module options">
                <MoreHorizontal size={18} />
              </button>
            }
            items={[
              {
                label: "Save editable copy",
                icon: Save,
                action: () => onAction("save"),
              },
              {
                label: "Add to folder / file",
                icon: FolderInput,
                action: () => onAction("add"),
              },
              {
                label: "Study",
                icon: BookOpen,
                action: () => onAction("study"),
              },
              {
                label: "Publish…",
                icon: Globe,
                action: () => onAction("publish"),
              },
              "separator",
              {
                label: "Delete module",
                icon: Trash2,
                danger: true,
                action: () => onAction("delete"),
              },
            ]}
          />
        )}
      </header>
      {!block.collapsed || readOnly ? (
        content
      ) : (
        <p className="module-collapsed">Content saved · Expand to continue</p>
      )}
    </section>
  );
}
