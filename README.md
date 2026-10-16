# SweatCheck

**Skipped a lecture? The people who went will tell you if it matters.**

After a lecture, students who attended rate it in 30 seconds: how useful it was, whether it's on the exam, whether it was new material, whether it was recorded on Panopto, what was covered, and anything said in the room. Students who skipped get a verdict written by Claude: **Chill**, **Skim it** or **Lock in**. They also get what they missed, the announcements they'd never otherwise hear, and a timed catch-up plan.

Built at the Claude Hackathon + Showcase: Better Student Life (UCL Entrepreneurs × Claude Builder Club UCL, 16 October 2026).

## What it does

- **Verdicts from the room.** Claude reads every attendee's notes and decides how much a skipper should worry. It starts from a score computed from the ratings, but can override it. In the demo "Lab report briefing", everyone rated the lecture low, so the ratings alone say *Chill*. Two notes mention that the deadline moved and that graphs now need error bars, so Claude raises it to *Skim it*.
- **Said in the room.** Deadlines, exam hints and board-only examples are pulled out and shown first.
- **Catch-up plan.** Concrete steps with minutes, one-click *Add to Google Calendar* or *Outlook*, and a personal catch-up list.
- **Ask the people who went.** Questions are answered by Claude using only what attendees wrote.
- **Exam hints by module.** Claude collects everything lecturers said about exams, deadlines and changes across a module's lectures.
- **How locked in you are.** A personal meter, from *Cooked* to *Locked in*: the share of the last four weeks' lectures you've covered, weighted by importance and recency. A mini version follows you around the app.
- **Covered switches, filters, live updates.** Mark lectures as covered (rating one does it automatically), filter by when, importance, status and module, and watch verdicts update live when someone rates.

## Two versions in this repo

| | Where | Claude | Data |
| --- | --- | --- | --- |
| **Hosted (the demoed version)** | `hosted/sweatcheck.html` | Runs inside Claude as a published artifact, using the viewer's own Claude account (no API key) | Shared live database provided by the artifact runtime |
| **Local Node app** | repo root (`server.js`, `public/`) | Calls the Anthropic API with your own key | A JSON file in `data/` |

### Hosted version

`hosted/sweatcheck.html` is the page that was demoed. It runs as a Claude artifact with the `db`, `sample` and `user` runtime capabilities, which provide the shared ratings database, the calls to Claude and a private per-person catch-up list. Opened as a plain file outside Claude, it shows a sign-in message instead of data. `hosted/demo-data.json` contains the demo lectures, ratings and pre-written verdicts that were loaded into its database.

### Local Node app

You need Node.js 18 or newer.

```bash
cp .env.example .env      # paste your key after ANTHROPIC_API_KEY=
npm install
npm start                 # http://localhost:3000
```

On Windows PowerShell, use `copy` instead of `cp`, and `npm.cmd` if script execution is blocked. Without a key, the app still runs and estimates verdicts from the ratings alone. Run `npm run reset` to recreate the demo data.

## How the verdict works

1. **Ratings score (0–100):** usefulness 40%, on the exam 30%, new material 15%, not recorded 10%, something announced 5%. Below 35 is Chill, 35–61 is Skim it, and 62 or above is Lock in.
2. **Claude reads the notes.** It stays near that score unless the notes justify moving it, for example "this is on the exam" or a changed deadline. When it moves the verdict, the page says so.
3. **Grounded output.** Claude returns a fixed JSON shape and is told to use only what attendees wrote. Notes are treated as data, not instructions.

## What's next

- UCL sign-in plus a code shown on the projector, so only people who were there can rate.
- Timetable import, so lectures appear automatically and verdicts show up in your calendar.
- A notification when a lecture you skipped turns into *Lock in*.
