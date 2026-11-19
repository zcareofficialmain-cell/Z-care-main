# ZCare AI Health Assistant

On-device, personalised health assistant. It answers questions from the signed-in user's own ZCare records. A small open language model runs **inside the browser**; there is no AI server, no paid API and no API key, and no medical data is sent to any AI provider.

## How an answer is produced

1. **Understanding** (`intent.service.ts`): rule-based topics, medicines (incl. Indian brand names), lab families, symptoms, follow-ups.
2. **Safety pre-check** (`safety.service.ts`): emergencies (chest pain, stroke, breathing, anaphylaxis, overdose, self-harm…) get a fixed response with 112 / 108 (and Tele-MANAS 14416) before any model runs. Medication-change, diagnosis, dosage and interaction questions are flagged.
3. **Retrieval** (`retrieval.service.ts`, `health-data.repository.ts`): only the record categories the question needs. Supabase queries use explicit columns plus `user_id = <id from supabase.auth.getUser()>`; **RLS is the real enforcement**. Report text is ranked by BM25 + MiniLM embeddings (on-device).
4. **Context** (`context-builder.service.ts`): dates, units, reference ranges, current vs past medicines, duplicate merging, conflicting flags, outdated results, trends, missing data. Allergy checks for a named medicine (incl. related drug classes). Anything cut for size is listed, not silently dropped.
5. **Answer**: key facts and alerts are shown **directly from the records** (never model-written). The model writes only a short explanation, checked sentence-by-sentence while streaming and again at the end: invented values, dates, medicines or diagnoses, "safe to take" claims, stop/change/dose instructions and discouraging care are removed, with a visible note. Allergy alerts are enforced.
6. Records-only mode (no model) and model failure both still give a records-based answer.

## Model

| | |
|---|---|
| Language model | **Qwen3-0.6B** (`onnx-community/Qwen3-0.6B-ONNX`), Apache-2.0 |
| GPU (WebGPU, fp16) | q4f16, ≈ 543 MB → first download ≈ **600 MB** total |
| GPU without fp16 | q4, ≈ 877 MB |
| CPU / compatibility mode | q8, ≈ 589 MB → ≈ **650 MB** total |
| Embeddings | `Xenova/all-MiniLM-L6-v2` q8, 22 MB, Apache-2.0 |
| Runtime | `@huggingface/transformers` 4.3.2 (Apache-2.0) in a Web Worker |

Downloaded once after the user agrees (size shown first) from the Hugging Face CDN, then cached in the browser (Cache API, `transformers-cache`). Removable in Assistant → Settings. Rejected after testing: Qwen2.5-0.5B (broken fp16 output on WebGPU, contradicted allergy alerts), Qwen3-1.7B / Qwen2.5-1.5B (fail to load in-browser: `std::bad_alloc`).

## Database

No migration and no manual SQL. It uses the existing tables read-only, under the existing RLS policies. Conversation history is kept in memory only (cleared on sign-out, account switch or "Clear").

## Run

```
npm install
npm run dev        # http://localhost:5173 → sign in → "Assistant"
npm test           # app tests + AI tests (no network, no model needed)
npm run build
```

## Manual two-account security check (hosted Supabase)

1. Sign in as user A and add a distinctive medicine (e.g. "Zz-Test-A"). Sign out.
2. Sign in as user B and ask the assistant "What medicines am I taking?". "Zz-Test-A" must not appear.
3. In user B's browser DevTools → Network: requests to `/rest/v1/*` carry user B's token only, and no request body contains record text. The only AI-related traffic is GET requests to `huggingface.co` / `cdn.jsdelivr.net` for model files.

## Known limitations

- **Not tested on real phones.** Only desktop Chrome (Intel GPU, WebGPU) and an iPhone-sized viewport emulation (no horizontal overflow) were tested. Phones need ≈ 650 MB storage and several GB of RAM; iOS Safari WebGPU support varies, so phones may fall back to CPU (slow) or records-only mode.
- **Compatibility (CPU) mode is slow.** Measured on a laptop in desktop Chrome: 75 s to 4 min per answer (vs 6–30 s on the graphics chip), and the explanations are weaker. The facts from the records still appear instantly. Records-only mode answers in under a second.
- A 0.6B model's explanations can be vague or slightly off; the validator removes unsupported claims, but users must confirm with their doctor (stated in the UI).
- ZCare does not check drug–drug interactions; it says so and refers to a pharmacist.
- Pre-existing issue (not from this feature): with Supabase configured, demo login queries `profiles` with the non-UUID id `demo-user-126` and logs a 400 / 22P02 error.
