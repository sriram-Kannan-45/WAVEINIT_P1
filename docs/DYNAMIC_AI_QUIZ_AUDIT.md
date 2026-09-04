# Dynamic AI quiz generation audit — 2026-09-04

## Result

All LMS prompt and material generation routes now use live topic analysis, generation and independent question review. Production generation has no static question bank, sentence-to-question fallback, or cached quiz fallback. Structured JSON schemas describe output shape only; they do not supply question content.

## Flow

1. Validate the request count, difficulty and source inputs.
2. Use Gemini to extract the actual educational topic, domain, concepts, coverage and per-question marks. Preserve the user's original request separately from the concise quiz title. No topic allowlist or domain-specific question factory is used.
3. Prioritize explicit notes, uploaded PDF/DOCX/PPTX/TXT/URL sources, or authorized course lessons and materials. Instructions embedded in these sources are treated as data. Unrelated optional course material does not override a requested topic; conflicting explicit material is reported.
4. Use model knowledge when no relevant source is supplied. For topics that the analysis identifies as current, obscure or uncertain, use Gemini Google Search grounding. Require provider grounding references and support metadata before using retrieved evidence.
5. Generate up to eight missing question slots at a time. Difficulty distribution and marks are assigned by the service. Mixed quizzes cycle Easy, Medium and Hard; explicit levels must match every slot. Default marks are one per question unless requested otherwise.
6. Validate structure and duplicate stems. Independently solve and review all candidate questions for relevance, plausible options, exactly one correct answer, source support, explanation, cognitive difficulty and semantic uniqueness. The reviewer sees prior accepted questions and the same source evidence as generation.
7. Retain accepted questions and replace only rejected/missing slots, with specific rejection feedback. Each slot has bounded retries. Exhaustion returns a validation error, never synthetic filler or a partial saved quiz.
8. Save only an unchanged batch carrying an in-process verification receipt. Normalize once more at persistence, then write the quiz, marks, questions and options in one transaction. A write failure rolls back the quiz.

## Removed paths

- Deleted the fixed elementary motion question bank.
- Removed the Python RAG fallback that inserted generic compiler/architecture options.
- Removed unused legacy sentence factories, mocked quiz generation, answer-repair helpers and cached quiz generation.
- Routed the legacy document URL to the validated RAG generator.
- Removed the frontend message advertising static maths fallback.

The Python document service now offers source extraction/retrieval independently of question generation. Backend material requests use the same audited generator as topic requests. Direct legacy Python document generation also performs live analysis, per-item validation, independent review and selective repair.

## Live provider finding

A minimal real request using the configured backend Gemini credentials returned HTTP 429 RESOURCE_EXHAUSTED. The provider reported exhaustion of the free-tier request quota (the final attempted model was gemini-2.5-flash). Successful live generation therefore could not be verified. No credentials were printed or changed, and no alternate account was selected.

The API now distinguishes AI_QUOTA_EXCEEDED, AI_CONFIGURATION_ERROR, AI_PROVIDER_UNAVAILABLE, QUIZ_SOURCE_UNAVAILABLE and QUIZ_VALIDATION_EXHAUSTED. A configured key or a healthy Python process is not evidence that provider quota is available.

Optional model overrides are QUIZ_GENERATION_MODEL and QUIZ_RETRIEVAL_MODEL; the latter must support Google Search grounding. Reference: https://ai.google.dev/gemini-api/docs/generate-content/google-search

## Verification

- 55 backend tests passed covering request analysis, multiple domains/languages, structural rejection, semantic review outcomes, selective repair, source priority, retrieval grounding, canonical difficulty, marks, tamper rejection, persistence and course scoping.
- 7 Python generation tests passed covering source-based selective repair, wrong answers, placeholder choices, Part N rejection, quota failure and bounded exhaustion.
- Frontend production build passed.
- Authenticated prompt and multipart-document API tests against the real database passed at Easy/Medium/Hard using explicitly isolated AI response fixtures. A forced option-insert failure rolled back all quiz writes. All verification records and files were rolled back/removed.
- Provider fixtures test application behavior, not model factual accuracy. No successful live quiz is claimed while the configured account is quota-exhausted. Independent model review reduces errors but is not a mathematical guarantee of correctness for every possible subject.

## Deployment scope

This is an existing Node/Sequelize and Python application with no Sites hosting manifest. Sites guidance and capabilities were inspected; a static Sites upload would not host the existing database and Python services. The application architecture is preserved. No Site was created or published.

Reloaded the running backend and Python AI service. Both health endpoints returned HTTP 200, and the new source preparation endpoint returned the supplied learning text successfully.

Existing saved quizzes have not been rewritten or deleted; the new validation applies to new generation requests.
