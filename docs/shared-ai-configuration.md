# Shared Gemini configuration

Set these environment variables on both the Node backend and the Python AI
service in Azure App Service:

```dotenv
GEMINI_API_KEY=<your first Gemini API key>
GEMINI_API_KEY2=<your second Gemini API key>
GROQ_API_KEY=<your Groq API key>
GEMINI_MODEL=gemini-3.5-flash-lite
GROQ_MODEL=openai/gpt-oss-120b
```

Deploy the updated code to both services and apply the settings. Text requests
try Gemini key 1, then Gemini key 2, then Groq. Each failure advances to the next
configured credential; a valid response stops the chain. Missing/placeholder keys
and duplicate Gemini keys are skipped. Errors and logs identify setting names,
never key values. Transport attempts share a bounded request deadline.

The shared configuration serves quiz generation and review, coding question generation, mentor
hints, chatbot responses, course structure generation, and Gemini document/vision
requests. Local embedding and code execution services keep their own settings.

`GEMINI_MODELS`, `QUIZ_GENERATION_MODEL`, `QUIZ_RETRIEVAL_MODEL`,
`CODING_GENERATION_MODEL`, and `AI_MENTOR_MODEL` no longer select separate Gemini
models; remove those obsolete Azure settings to avoid confusion.

Vision requests try both Gemini keys. The configured Groq text model does not
support images, so it is not used as a vision fallback. If all applicable
credentials fail, the request returns an error and no generated quiz is saved.
Two Gemini keys in the same Google project can share quota; a second key does
not guarantee extra capacity.

In local development, the backend reads missing `GEMINI_API_KEY`, `GEMINI_API_KEY2`, and
`GEMINI_MODEL` values from `ai-service/.env`. Azure environment settings take
precedence; configure both deployed services directly.
