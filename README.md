# AspectScript

An implementation of the AspectScript extension language for JavaScript, based on the AOSD 2010 paper "AspectScript: Expressive Aspects for the Web".

## Quick start (npm)

Install:

```bash
npm install aspectscript
```

### JavaScript example

```js
const AJS = require("aspectscript");
const PCs = AJS.Pointcuts;

AJS.before(PCs.event("purchase"), function (jp) {
  console.log("purchase observed:", jp.orderId, jp.total);
});

AJS.event("purchase", { orderId: "A-100", total: 42 }, function () {
  console.log("inside purchase block");
});
```

### TypeScript example

```ts
import AspectScript = require("aspectscript");

const AJS = AspectScript;
const PCs = AJS.Pointcuts;

AJS.around(PCs.event("audit"), (jp) => {
  console.log("audit event:", jp.action);
  return jp.proceed();
});

AJS.event("audit", { action: "DELETE_USER" }, () => {
  console.log("business logic");
});
```

### Running instrumented scripts (`exec`, `call`, `get`, `set`, ...)

Use the CLI runner so your file is instrumented automatically:

```bash
npx aspectscript run your-script.js
```

## What is included

- A runtime and source instrumenter for AspectScript.
- A Node-based test runner that executes the original `tests/test*.js` suite while ignoring legacy `load(...)` lines.
- A CLI command (`aspectscript`) for running scripts and tests.
- TypeScript type definitions (`index.d.ts`).
- A static playground in `docs/` with:
  - editable examples
  - execution output
  - join point tracing

## Local usage

Install dependencies:

```bash
npm install
```

Run the test suite:

```bash
npm test
```

Run with cache statistics:

```bash
node run-tests.js --cache-stats
```

Run only failed tests from the previous run:

```bash
npm run test:failed
```

Run any script/example file with AspectScript runtime + instrumentation:

```bash
npm run run:script -- tests/test-ex.js
```

Run and export execution trace as JSON:

```bash
npm run run:script -- tests/test-ex.js --trace-json trace.json
```

Disable transform cache for a run:

```bash
npm run run:script -- tests/test-ex.js --no-cache
node run-tests.js --no-cache
```

Run paper-aligned conformance examples:

```bash
npm run test:conformance
```

Use the CLI command:

```bash
npx aspectscript run tests/test-ex.js
npx aspectscript test
npx aspectscript test --failed
```

Serve the playground locally from `docs/`:

```bash
cd docs
python3 -m http.server 4173
```

Then open `http://127.0.0.1:4173`.

## GitHub guide

For a full command-line and GitHub usage guide, see [GITHUB_USAGE.md](./GITHUB_USAGE.md).
For practical examples/patterns, see [PATTERNS.md](./PATTERNS.md).
For package publishing readiness, see [NPM_PUBLISH.md](./NPM_PUBLISH.md).

## Current test status

The current implementation passes 105 of 105 legacy tests.
