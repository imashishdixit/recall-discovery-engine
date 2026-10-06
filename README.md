# Photo recall discovery engine

Collects public feedback about finding photos in Google Photos, codes every item
against one fixed codebook with a language model, and compares where retrieval
breaks when memory is incomplete.

Pipeline: **Collect** (Play Store, App Store, Reddit, pasted text) → **Screen**
(keyword filter) → **Code** (LLM, fixed codebook, quotes verified against source)
→ **Compare** (counts computed in code, every number opens its evidence)
→ **Synthesise and ask** (LLM, must cite item ids from the dataset).

## 1. Run it locally (10 minutes)

Needs Node 20 or newer.

```bash
npm install
cp .env.example .env      # then paste ONE key into .env
npm run dev               # http://localhost:3000
```

Keys: a Gemini key is free at https://aistudio.google.com/apikey. An Anthropic
key also works. If the default model name is rejected, set `LLM_MODEL` in `.env`
to a current model.

`npm test` runs the pipeline in mock mode with no key and no network.

## 2. Build the real dataset

Do this locally first, because your home connection is less likely to be blocked
by Play Store and Reddit than a cloud server.

1. **Collect.** Fetch Play Store reviews (try "Most helpful" and "Newest", India
   and US), App Store reviews, and the Reddit searches. For the Google Photos
   Help Community, YouTube comments or anything a fetcher cannot reach, copy the
   text and use "Paste feedback" with the link.
2. **Code.** Press "Code N items". On the Gemini free tier it pauses and resumes
   when the rate limit is hit. You can stop and continue later; progress is saved
   in the browser.
3. **Compare.** Read the tables, click through to evidence, then "Draft
   opportunity areas".
4. **Export dataset** (Collect tab) and save the file over `public/snapshot.json`.
   Visitors to the deployed link then see your coded dataset immediately instead
   of an empty tool.

## 3. Deploy to Vercel

```bash
git init && git add . && git commit -m "Discovery engine"
# push to a GitHub repo, then on vercel.com: Add New > Project > import the repo
```

- Framework preset: **Other**. Leave build command and output directory empty.
- Settings > Environment Variables: add `GEMINI_API_KEY` (or `ANTHROPIC_API_KEY`),
  then redeploy.

Or from the terminal: `npx vercel --prod`, then add the variable with
`npx vercel env add GEMINI_API_KEY production` and deploy again.

Because the link is public, anyone can trigger model calls. Use a free-tier key
or set a spend limit on it.

## What is in here

| Path | Purpose |
| --- | --- |
| `public/` | The page (`index.html`, `app.js`, `styles.css`) and `snapshot.json` |
| `api/collect.js` | Fetches Play Store, App Store and Reddit |
| `api/code.js` | Codes a batch of items against the codebook |
| `api/synthesize.js` | Drafts opportunity areas with checked citations |
| `api/ask.js` | Answers a question from coded rows only |
| `lib/taxonomy.js` | The codebook, plus the checks that keep answers on it |
| `lib/prompts.js` | The instructions given to the model |
| `test/` | Mock-mode smoke test. The fixture text is synthetic, not real reviews |

## Known limits

- The Play Store and Reddit fetchers use unofficial public endpoints and can be
  blocked or change without notice. "Paste feedback" always works.
- Review writers are not a sample of all users. Use the counts to compare
  problems within this dataset, not to claim how common they are overall.
