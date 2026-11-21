# summit: one step at a time

A Chrome extension that replaces your new tab page with a to-do list, a clock, and a scenic mountain background that changes with the time of day.

No accounts, no network requests: everything is stored locally in your browser.

## Features

- **To-do list on every new tab**: add, edit, complete, reorder and delete tasks.
- **Categories**: group tasks into categories shown as tabs; double-click a category to rename it, or manage them all from the categories panel.
- **Filters**: show Active, Completed or All tasks, and clear completed ones in one click.
- **Paste a list**: paste several lines at once (plain lines, bullets, numbered items or `[ ]` / `[x]` checkboxes) and each line becomes a task.
- **Copy as Markdown**: copy the visible tasks to the clipboard as a Markdown checklist.
- **Clock and date**: click the clock to switch between 12- and 24-hour time.
- **Scenic backgrounds**: by default the scene follows the time of day, blending through night, dawn, morning, midday, afternoon, golden hour and dusk. Or pick a fixed theme: Dawn, Alpine, Forest, Dusk, Night, Desert or Ocean.
- **Dock to the side** or keep the list centered.
- **Backup and restore**: copy or download your data as JSON, and restore it from a file or pasted JSON.
- **Syncs across open tabs**: changes made in one new tab show up in the others.

## Install

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the repository folder.
5. Open a new tab.

Clicking the extension's toolbar icon also opens the list in a new tab. To switch back to another new tab page (Momentum, say), right-click the icon and choose **Disable summit…**: it opens summit's entry in `chrome://extensions`, where you flip the toggle off (and back on later). Your tasks are kept while it's disabled.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `/` or `n` | Jump to the "Add a task…" box |
| `Enter` | Add the task (in the input box) |
| `↑` / `↓` | Move between tasks |
| `Alt`/`Cmd` + `↑` / `↓` | Move the focused task up or down |
| `Space` | Mark the focused task done or not done |
| `Enter` or `F2` | Edit the focused task |
| `Delete` / `Backspace` | Delete the focused task |
| `Esc` | Cancel editing or close a panel |

Tasks can also be reordered by drag and drop.

## Preview a time of day

Add `?hour=` to the page URL to preview the automatic background at a given hour, for example `newtab.html?hour=18.5` for golden hour.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | Extension manifest (Manifest V3) |
| `newtab.html` | New tab page: markup and styles |
| `app.js` | All app logic: tasks, categories, scenes, clock, backup |
| `background.js` | Toolbar icon: opens the page on click, adds the Disable menu item |
| `icons/` | Extension icons |

## Privacy

Data is saved to the extension's `localStorage` and never leaves your computer. Use **Backup & Restore** to move your tasks to another browser.
