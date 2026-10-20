# Weekly checkups

Open **Weekly checkups** in the main navigation to hold a guided weekly meeting with yourself. Weeks run Monday–Sunday, using the workspace timezone to select the current week. Each week has one checkup; choosing that week again resumes its draft or completed record.

## Weekly rhythm

1. Choose **Whole-life reset**, **The 10-minute check-in**, **Goals into action**, or a custom template, then press **Begin**. The dashboard gives way to a focused experience with a progress indicator and one segment on screen at a time.
2. Plan upcoming tasks using the centered weekly calendar. Select a day, add tasks, check completed tasks, and write daily focus, events, and planning notes. **Next** opens the meal planner, with breakfast, lunch, dinner, and grocery or preparation notes. The finance segment has amount cards, a currency selector, and savings-goal progress when both balances are entered.
3. Continue through the template's wellbeing, reflection, and intention segments. **Back** revisits the previous segment; the segment selector can revisit any part. Required prompts are checked before Next and again before finishing. **Save & exit** returns to the dashboard; **Resume checkup** restores the last segment, including after a reload.
4. Review last week's commitments as accomplished, partly accomplished, or not this time. Add a reflection and optionally carry unfinished actions forward. Reviews update the original week's record. A missing week is shown explicitly rather than silently reviewing an older week.
5. Add concrete commitments, optionally link them to long-term goals, and press **Finish checkup**. A completion screen closes the experience. Reopen a completed checkup to edit answers; outcomes can also be reviewed separately. Entries continue to use workspace autosave, offline draft recovery, and the existing save-status indicator.

## Forms and goals

The Templates section supports copying a starter or building a form from scratch. Add, remove, and move sections and prompts; write guidance; mark prompts required; and preview before saving. Each section has a **Segment experience**: guided reflection, calendar and task planning, meal planner, or finance dashboard. Selecting a specialized layout adds its supporting prompt types if missing. Prompt types include short answers, reflections, numbers, 1–5 ratings, checklists, task lists, and seven-day planners. Task lists support up to 100 tasks per prompt. Number prompts can be marked as currency amounts so comparison respects the selected currencies. Limits are 100 custom templates, 16 sections per template, and 30 prompts per section.

Each checkup stores a full template snapshot. Renaming, rearranging, or deleting a template does not change existing checkups. Customization preserves prompt identities so comparable answers remain aligned across weeks. Changing a response type prevents an inappropriate numeric comparison.

Older snapshots without segment layouts remain readable and editable in the guided experience. To adopt a different template for an unfinished week, select **Change template** on its resume screen. The notice explains that Begin keeps matching responses and commitments, but discards responses for removed prompts. Completed weeks must be reopened before changing their template.

Long-term goals have a life area, a reason or definition of success, and an optional target date. Their progress counts accomplished weekly commitments linked to that goal, rather than estimating completion of the entire goal. Archive a goal to remove it from new commitment choices while retaining its history. Goal names are also snapshotted onto commitments.

## History and consistency

History includes drafts and completed checkups, with search across dates, responses, and commitments. The explorer groups checkups by month. Compare any two saved weeks side by side, including numeric differences, commitment outcomes, and prompts that exist in only one template. Amounts in different currencies are not converted or subtracted.

The current streak counts consecutive completed weeks through this week or the previous week, giving users the current week to finish. Future weeks and drafts do not increase it. The twelve-week activity strip opens any of those weeks. Commitment totals use completed past weeks; unreviewed actions remain in the denominator, and partial outcomes are reported separately. Deleting or reopening a checkup recalculates these figures.

## Storage and integration

Data lives in the optional `settings.weeklyCheckups` workspace field and flows through existing local/cloud persistence and workspace patches. Older workspaces need no migration. Validation covers templates, typed answers, calendar weeks, and unique records. This feature has no external bank or calendar connection.

Full workspace backups include checkups, templates, goals, and reflections. Restore preserves existing weeks and reports duplicates instead of overwriting them. Normal collection exports omit the data. The tab is personal-workspace only and is hidden in live shared collections. The note inspector is hidden while using this tab, and restored when returning to notes.

Implementation: `src/lib/weekly-checkups.ts`, the `WeeklyCheckups`, `CheckupSession`, `CheckupPlanning`, and `CheckupForms` components, and their stylesheets.

## Verification

```sh
npm run typecheck
npx vitest run tests/weekly-checkups.test.ts tests/learning.test.ts tests/domain.test.ts --maxWorkers=1 --no-file-parallelism
npx playwright test --config playwright.weekly-checkups.config.ts
```

The focused browser configuration uses installed Microsoft Edge by default; set `BROWSER_CHANNEL` for another installed Chromium channel. Tests exercise the main tab, guided planning, goals, previous-week reflections, comparisons, autosave/reload, template snapshots, required prompts, mobile layout, and an accessibility scan of the planning form.
