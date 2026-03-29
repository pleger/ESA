const examples = [
  {
    id: "simple-match",
    title: "Simple Match",
    description: "Deploy an ESA aspect that matches one call join point.",
    code: `function a() {
  Testing.flag("a");
}

var aspect = {
  kind: ESA.BEFORE,
  pattern: PTs.call(a),
  advice: function () {
    Testing.flag("match");
  }
};

var h = ESA.deploy(aspect);
a();
ESA.undeploy(h);
Testing.check("match", "a");`,
  },
  {
    id: "sequence",
    title: "Sequential Pattern",
    description: "Match the pattern a then b and advise before b.",
    code: `function a() { Testing.flag("a"); }
function b() { Testing.flag("b"); }

var aspect = {
  kind: ESA.BEFORE,
  pattern: PTs.seq(PTs.call(a), PTs.call(b)),
  advice: function () {
    Testing.flag("ab");
  }
};

var h = ESA.deploy(aspect);
a();
b();
ESA.undeploy(h);
Testing.check("a", "ab", "b");`,
  },
  {
    id: "repeat-until",
    title: "repeatUntil",
    description: "Accumulate bindings until a terminal event appears.",
    code: `function a(v) { Testing.flag("a"); }
function b() { Testing.flag("b"); }

var callA = PTs.call(a).and(function (jp, env) {
  return env.bind("value", jp.args[0]);
});

var aspect = {
  kind: ESA.BEFORE,
  pattern: PTs.repeatUntil(callA, PTs.call(b)),
  advice: function (jp, env) {
    var values = env.value instanceof Array ? env.value : [env.value];
    Testing.flag("sum:" + values.reduce(function (x, y) { return x + y; }, 0));
  }
};

var h = ESA.deploy(aspect);
a(1);
a(2);
b();
ESA.undeploy(h);
Testing.check("a", "a", "sum:3", "b");`,
  },
  {
    id: "tracematch",
    title: "Tracematch Deploy",
    description: "Use ESA.tracematchLib with an explicit alphabet.",
    code: `function a(v) { Testing.flag("a"); }
function b() { Testing.flag("b"); }

var bindA = PTs.call(a).and(function (jp, env) {
  return env.bind("value", jp.args[0]);
});

var aspect = {
  kind: ESA.BEFORE,
  pattern: PTs.starUntil(bindA, PTs.call(b)),
  advice: function (jp, env) {
    var values = env.value instanceof Array ? env.value : [env.value];
    Testing.flag("sum:" + values.reduce(function (x, y) { return x + y; }, 0));
  }
};

var h = ESA.tracematchLib.deploy(aspect, [PTs.call(a), PTs.call(b)]);
a(1);
a(5);
a(10);
b();
ESA.undeploy(h);
Testing.check("a", "a", "a", "sum:16", "b");`,
  },
  {
    id: "chain-advice",
    title: "Chain Advice",
    description: "Schedule multiple matches through tracematch chainAdvice.",
    code: `function a() { Testing.flag("a"); }
function b() { Testing.flag("b"); }

var aspect = {
  kind: ESA.AROUND,
  pattern: PTs.seq(PTs.call(a), PTs.call(b)),
  matching: ESA.matching.multiple,
  advising: function (matchCells, jp, advice) {
    return ESA.tracematchLib.chainAdvice(matchCells, ESA.AROUND, advice)(jp);
  },
  advice: function (jp) {
    Testing.flag("match");
    return jp.proceed();
  }
};

var h = ESA.deploy(aspect);
a();
a();
a();
b();
ESA.undeploy(h);
Testing.check("a", "a", "a", "match", "match", "match", "b");`,
  },
  {
    id: "aspectscript-compatible",
    title: "AspectScript Compatible",
    description: "ESA runs alongside regular AspectScript APIs.",
    code: `function hello(name) {
  print("hello " + name);
}

var h = AJS.before(PCs.exec(hello), function () {
  Testing.flag("before");
});

hello("ESA");
AJS.undeploy(h);
Testing.check("before");`,
  },
];

const exampleList = document.getElementById("example-list");
const editor = document.getElementById("editor");
const output = document.getElementById("output");
const traceBody = document.getElementById("trace-body");
const runButton = document.getElementById("run-button");
const exportTraceButton = document.getElementById("export-trace-button");
const resetButton = document.getElementById("reset-button");
const runnerFrame = document.getElementById("runner-frame");

let currentExample = examples[0];
let lastTraceEntries = [];

function stripLoads(source) {
  return source
    .split("\n")
    .filter((line) => !/^\s*load\(/.test(line))
    .join("\n");
}

function appendOutput(line = "") {
  output.textContent += line + "\n";
}

function setOutput(lines) {
  output.textContent = lines.join("\n");
}

function renderExamples() {
  exampleList.innerHTML = "";
  for (const example of examples) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "example-button" + (example.id === currentExample.id ? " active" : "");
    button.innerHTML = `<strong>${example.title}</strong><span>${example.description}</span>`;
    button.addEventListener("click", () => {
      currentExample = example;
      editor.value = example.code;
      renderExamples();
      clearOutput();
      clearTrace();
    });
    exampleList.appendChild(button);
  }
}

function clearOutput() {
  setOutput(["Ready."]);
}

function clearTrace() {
  traceBody.innerHTML = "";
  lastTraceEntries = [];
}

function renderTrace(entries) {
  lastTraceEntries = entries.slice();
  clearTrace();
  lastTraceEntries = entries.slice();
  entries.forEach((entry, index) => {
    const tr = document.createElement("tr");
    tr.className = "trace-row" + (entry.matched ? " matched" : "");
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${entry.label}</td>
      <td><span class="pill ${entry.matched ? "yes" : "no"}">${entry.matched ? "yes" : "no"}</span></td>
      <td>${entry.beforeOrAroundMatches + entry.afterMatches}</td>
    `;
    traceBody.appendChild(tr);
  });
}

function exportTraceJson() {
  if (!lastTraceEntries.length) {
    appendOutput("No trace to export. Run an example first.");
    return;
  }
  const payload = JSON.stringify(lastTraceEntries, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const a = document.createElement("a");
  a.href = url;
  a.download = "esa-trace-" + stamp + ".json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  appendOutput("Trace exported as JSON.");
}

function makeTesting(logs) {
  const flags = [];

  function format(value) {
    if (typeof value === "string") {
      return value;
    }
    if (value && typeof value.toString === "function" && value.toString !== Object.prototype.toString) {
      return String(value);
    }
    return JSON.stringify(value);
  }

  return {
    flag(value) {
      flags.push(value);
      logs.push("flag: " + format(value));
    },
    assert(expr) {
      if (!runnerFrame.contentWindow.eval(String(expr))) {
        throw new Error("Assertion failed: " + expr);
      }
      logs.push("assert ok: " + expr);
    },
    assert2(label, condition) {
      if (!condition) {
        throw new Error("Assertion " + label + " failed");
      }
      logs.push("assert2 ok: " + label);
    },
    check(...expected) {
      if (expected.length !== flags.length) {
        throw new Error("Expected " + expected.join(" ") + " but got " + flags.join(" "));
      }
      for (let i = 0; i < expected.length; i += 1) {
        if (expected[i] !== flags[i]) {
          throw new Error("Expected " + expected.join(" ") + " but got " + flags.join(" "));
        }
      }
      logs.push("check ok: " + expected.join(" "));
      flags.length = 0;
    },
  };
}

function prepareFrame(logs) {
  const frameWindow = runnerFrame.contentWindow;
  frameWindow.document.open();
  frameWindow.document.write("<!doctype html><title>runner</title>");
  frameWindow.document.close();

  frameWindow.console = {
    log: (...args) => logs.push(args.join(" ")),
    error: (...args) => logs.push("error: " + args.join(" ")),
    warn: (...args) => logs.push("warn: " + args.join(" ")),
  };
  frameWindow.print = (...args) => logs.push(args.join(" "));
  frameWindow.load = () => {};
  frameWindow.Function = window.Function;
  frameWindow.AspectScript = window.AspectScript.createAspectScript(frameWindow);
  frameWindow.AJS = frameWindow.AspectScript;
  frameWindow.PCs = frameWindow.AspectScript.Pointcuts;
  frameWindow.ESA = frameWindow.AspectScript.ESA;
  frameWindow.PTs = frameWindow.AspectScript.PTs || (frameWindow.ESA && frameWindow.ESA.Pointcuts);
  frameWindow.Testing = makeTesting(logs);
  frameWindow.AspectScript.tracer.enable();

  return frameWindow;
}

function runCurrentCode() {
  const logs = [];
  clearTrace();
  try {
    const frameWindow = prepareFrame(logs);
    const transformed = window.AspectScriptInstrument.transformProgram(stripLoads(editor.value));
    frameWindow.eval(transformed + "\n//# sourceURL=playground-example.js");
    renderTrace(frameWindow.AspectScript.tracer.getEntries());
    setOutput(logs.length ? logs : ["Done."]);
  } catch (error) {
    setOutput((logs.length ? logs : []).concat([
      "",
      error && error.stack ? error.stack : String(error),
    ]));
  }
}

runButton.addEventListener("click", runCurrentCode);
exportTraceButton.addEventListener("click", exportTraceJson);
resetButton.addEventListener("click", () => {
  editor.value = currentExample.code;
  clearOutput();
  clearTrace();
});

editor.value = currentExample.code;
renderExamples();
clearOutput();
