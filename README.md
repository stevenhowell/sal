# SAL (Safe After Leaving)

> A voice helper for IHH clients leaving recuperative care: it interviews them in plain words, searches a checked list of Orange County programs while they talk, and hands back today's one step, with every fact traced to its source for the case manager.

**Team:** SAL
**Members:** Steven Howell
**Challenge:** 2 Finding the right resource
**Built at:** Orange County | Claude Impact Lab, October 17, 2026, with Illumination Health + Home

## The problem

A client leaving recuperative care has practical questions: where do I sleep, who can help me find work, can I get a small loan, can anyone help me get home to family? Orange County has programs for some of these, but most shelters are referral only, eligibility is scattered across dozens of sites, and for loans and travel home there is almost nothing public. People leave without knowing what to do today, and a case manager with a full caseload has to work it out from scratch each time.

## What we built

Two screens showing one conversation:

- **Client's tablet: a call with Sal.** The client presses Call, hears it ring, and Sal picks up. It's a hands-free voice conversation: Sal asks one short question at a time (English or Spanish), and the mic reopens each time Sal finishes speaking. At the end Sal reads the client's plan for today, says goodbye, and hangs up. The client never sees the profile.
- **Case manager's screen.** The profile fills in as the client talks. After every answer, SAL searches the 41 checked programs again and the shortlist updates live. The search also suggests Sal's next deciding question, for example age, because several programs depend on it. At the end, staff see every option marked *fits*, *doesn't fit* or *unknown*, the exact quote from the program's listing, the date it was checked, its confidence, and a link to the source.
- **Discharge packet (PDF).** One click builds a printable packet in the client's language: today's steps, what to bring, each program with its phone, hours, how to get in and the date it was checked, a page of safety numbers read from the data, and lines for case manager notes and sign-off. It's marked DRAFT until the case manager ticks "Reviewed". [Sample packet](docs/sample-discharge-packet.pdf) for a made-up client.
- **Text message draft.** The plan as a text, shown the way it would arrive on the client's phone, with its length. Sending is switched off: the event's rules say to draft messages, not send them.

Open `/demo.html` to watch a whole interview play by itself: Claude plays a made-up client from the event's scenario file while Sal interviews them. **Skip to end** loads a finished conversation the exam recorded, to go straight to the plan, text draft and packet.

**Try it live:** [sal.stevenluishowell.workers.dev](https://sal.stevenluishowell.workers.dev) (Home · Demo · Why) · [demo full screen](https://sal.stevenluishowell.workers.dev/demo) · [the app](https://sal.stevenluishowell.workers.dev/app) · [exam results](https://sal.stevenluishowell.workers.dev/results)

**Demo video:** [link to add]

## How Claude is used

**Built with Claude:** the whole project was built today with Claude Code (Claude Opus 5.5).

**Inside the tool:**

| Step | Model | What it does | What catches mistakes |
|---|---|---|---|
| Safety, layer 1 | none (code) | Word lists in English and Spanish for clear danger, self-harm and medical questions | Fixed replies written by people; the hotline number is read from its data entry |
| Safety, layer 2 | Claude Haiku 5.5 | Reads every client message for risk the word lists miss ("what's the point anymore", "my ex keeps showing up") | Runs at the same time as Sal's reply; a risk verdict replaces Sal's reply and stops the interview |
| Interview | Claude Haiku 5.5 | Asks the next question and updates the profile | At most about 6 questions; never asks about immigration; no medical, legal or immigration advice; any phone number in a reply is removed |
| Live search | Claude Haiku 5.5 | Shortlists programs from the profile so far, and suggests the next deciding question | Every quote must match the listing word for word |
| Plan | Claude Opus 5.5 | Matches the confirmed profile to the checked list and writes today's steps | Claude never writes a phone number, address or hours. It writes `{{phone:entry-id}}` and code fills in the value from the list. A checker throws out any option whose quote isn't in its listing, any entry that isn't on the list, and any number Claude typed itself |
| Voice | Grok text-to-speech (voice "Lumen") | Reads Sal's words aloud | It only reads text that has already passed the checks; the browser voice is the fallback |

**What a person checks:** the case manager reviews the plan before the client acts on it. Every fact shows its source and check date; low-confidence programs say "call first".

## Try it

Needs Node.js 20 or newer, a Claude API key, and (optionally) an xAI key for the Lumen voice.

```bash
git clone https://github.com/stevenhowell/sal.git
cd sal
npm install
cp .dev.vars.example .dev.vars    # then put your keys in .dev.vars
npm run dev                       # http://127.0.0.1:8820
```

- `http://127.0.0.1:8820/`: the SAL site (Home, Demo, Why)
- `http://127.0.0.1:8820/app`: client and staff panels together
- `http://127.0.0.1:8820/demo.html`: the client's tablet and the case manager's screen side by side
- `http://127.0.0.1:8820/results.html`: the exam scoreboard

Speech input needs Chrome or Safari. Without an xAI key, SAL uses the browser's voice.

**Tests**, with the server running in another terminal:

```bash
npm run exam                   # Claude plays the 12 scenario clients; rules in eval/rules.json
node eval/adversarial.mjs      # 28 battle tests: safety, manipulation, tricky profiles, bad input
node eval/run.mjs --personas   # 7 hard clients: one-word answers, anger, switching to Spanish, correcting the summary, rambling, a couple with a dog, wanting to stop
```

## What is real and what is mocked

| Part | Status |
|---|---|
| Voice interview in English and Spanish | Working (typing works everywhere; speech input needs Chrome or Safari) |
| Two-layer safety check | Working |
| Live search while the client talks | Working |
| Plan with sources, checker and reading level | Working |
| Lumen voice | Working with an xAI key; browser voice otherwise |
| Call with Sal (ring, pick up, hands-free) | Working in the browser. **Not a real phone number:** a phone line would need a calling service such as Twilio |
| Discharge packet PDF | Working (Save as PDF from the browser) |
| Text message | **Draft only.** Nothing is sent, per the event rules |
| Program data | Real: the event's 40-entry seed list (checked Oct 13) plus one entry we added, the National Domestic Violence Hotline, from its own site on Oct 17 |
| "Staff called to the room" | **Mocked.** Nothing is sent to anyone |
| Clients | **Made up.** The 12 scenarios from the event repo; Claude plays them in the demo and exam |
| Case manager review, sending the plan | **Not built.** The plan is a draft to copy or print; nothing is sent |

## Where it gets things wrong

- **The data ages.** Every listing was checked on October 13. Programs close and numbers change. SAL shows the check date and says "call first" for low-confidence entries, but it can't know about changes since then.
- **Many answers are "unknown".** When a listing doesn't say whether a shelter has bottom bunks or walker access, SAL says unknown. That's correct, but it leaves work for staff.
- **Thin needs stay thin.** Small loans and travel home have almost no public programs. SAL says so honestly rather than stretching a bad match.
- **The safety check can be wrong in both directions.** In our tests it caught all 7 risky phrasings (English and Spanish, several indirect) and left 4 harmless ones alone, but a model screening messages is not a clinician. Staff must still be in the room.
- **The interview can miss things.** It asks about 6 questions. A client who mentions something once in passing may not have it reflected in the plan.
- **Made-up clients are not real clients.** We added 7 hard personas (one-word answers, anger, switching to Spanish mid-way, correcting the summary, rambling, a couple with a dog, wanting to stop), but real conversations will still find new failures.
- **Spanish plans contain some English.** Program names and listing text (like "(toll-free)") are pasted in as they appear in the English-language list.

**Test results on Oct 17:** 12 of 12 scenarios, 7 of 7 hard personas, and 28 of 28 battle tests. The first runs found real problems, all fixed and retested: a checker bug that damaged its own placeholders, word lists that missed indirect self-harm and stopped "not safe for my leg", Sal never asking about military service (so a veteran missed the VA), a safety check that read "Expired. Last year." as medical without Sal's question for context, Sal making promises for staff, and stale replies after Start over.

## Next steps

- IHH staff mark a program "confirmed by phone today" from the staff screen, so the list improves with use.
- Add what IHH does today for travel home and small loans, the two needs with almost no public help.
- A phone line for clients with a flip phone (calls only).
- More languages: Vietnamese and Korean are common in Orange County.
- Pilot with one case manager for a week, comparing time to a first step with and without SAL.

## Data and privacy

This project uses only data from the event repo and public sources. It contains no real patient or client information. It does not connect to any Illumination Health + Home system. The profile lives in the browser for one session and is cleared when the interview stops for safety. API keys stay in environment variables and are never committed. The live demo caps message sizes and limits each visitor to about 120 requests a minute so a public link can't run up the bill.

## License

[MIT](LICENSE)
