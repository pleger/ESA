#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const repoRoot = __dirname;
const testsDir = path.join(repoRoot, "tests");
const sourcePath = path.join(testsDir, "testESA.js");
const generatedPrefix = "testESA.case.";

function isTestSuiteAddStatement(statement) {
  if (!statement || statement.type !== "ExpressionStatement") {
    return false;
  }
  const expr = statement.expression;
  if (!expr || expr.type !== "CallExpression") {
    return false;
  }
  const callee = expr.callee;
  if (!callee || callee.type !== "MemberExpression" || callee.computed) {
    return false;
  }
  return callee.object &&
    callee.object.type === "Identifier" &&
    callee.object.name === "TestSuite" &&
    callee.property &&
    callee.property.type === "Identifier" &&
    callee.property.name === "add";
}

function sanitizeName(name) {
  const raw = String(name || "unnamed");
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "unnamed";
}

function pad3(value) {
  return String(value).padStart(3, "0");
}

function main() {
  if (!fs.existsSync(sourcePath)) {
    throw new Error("Missing source file: " + sourcePath);
  }

  const source = fs.readFileSync(sourcePath, "utf8");
  const ast = acorn.parse(source, {
    ecmaVersion: "latest",
    sourceType: "script",
    ranges: true,
  });

  const addStatements = ast.body.filter(isTestSuiteAddStatement);
  if (!addStatements.length) {
    throw new Error("No TestSuite.add(...) statements found in " + sourcePath);
  }

  const firstStart = addStatements[0].start;
  const prelude = source.slice(0, firstStart).trimEnd() + "\n\n";

  const existingGenerated = fs.readdirSync(testsDir)
    .filter((name) => name.startsWith(generatedPrefix) && name.endsWith(".js"));
  for (const fileName of existingGenerated) {
    fs.unlinkSync(path.join(testsDir, fileName));
  }

  const written = [];
  addStatements.forEach((statement, index) => {
    const call = statement.expression;
    const firstArg = call.arguments && call.arguments[0];
    const testName = (firstArg && firstArg.type === "Literal") ? firstArg.value : ("case-" + (index + 1));
    const slug = sanitizeName(testName);
    const fileName = generatedPrefix + pad3(index + 1) + "." + slug + ".js";
    const caseCode = source.slice(statement.start, statement.end);
    const payload = prelude + caseCode + "\n\nTestSuite.run();\n";
    fs.writeFileSync(path.join(testsDir, fileName), payload, "utf8");
    written.push(fileName);
  });

  process.stdout.write("Generated " + written.length + " files in tests/:\n");
  written.forEach((fileName) => process.stdout.write(" - " + fileName + "\n"));
}

main();
