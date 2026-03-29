let createESAExtension = null;
if (typeof globalThis !== "undefined" && typeof globalThis.createESA === "function") {
  createESAExtension = globalThis.createESA;
}
if (typeof require === "function") {
  try {
    ({ createESA: createESAExtension } = require("./esa"));
  } catch (error) {
    // keep global fallback if available
  }
}

function createAspectScript(runtimeGlobal = globalThis) {
  const globalObject = runtimeGlobal;
  const state = {
    currentJP: null,
    currentLevel: 0,
    currentAspect: null,
    globalDeployments: [],
    frameStack: [],
    pendingCalls: [],
    downStack: [],
    nextAspectId: 1,
    nextScopeId: 1,
    traceEnabled: false,
    traceEntries: [],
  };

  function pushTrace(entry) {
    if (!state.traceEnabled) {
      return;
    }
    state.traceEntries.push(entry);
  }

  function rootFrame() {
    return {
      lexicalObjects: [globalObject],
      lexicalFunctions: [],
      dynamicAspects: [],
      receiver: globalObject,
    };
  }

  state.frameStack.push(rootFrame());

  function currentFrame() {
    return state.frameStack[state.frameStack.length - 1];
  }

  function ensureAspectList(target) {
    if (!target) {
      return [];
    }
    if (!Object.prototype.hasOwnProperty.call(target, "__asDeployments")) {
      Object.defineProperty(target, "__asDeployments", {
        value: [],
        writable: true,
        configurable: true,
      });
    }
    return target.__asDeployments;
  }

  function normalizeFn(value) {
    if (typeof value === "function") {
      return value;
    }
    return function constantFn() {
      return value;
    };
  }

  function normalizeStrategy(strategy) {
    const ss = strategy || [false, false, true];
    return [normalizeFn(ss[0]), normalizeFn(ss[1]), normalizeFn(ss[2])];
  }

  function uniqueById(items) {
    const out = [];
    const seen = new Set();
    for (const item of items) {
      if (!item || seen.has(item.id)) {
        continue;
      }
      seen.add(item.id);
      out.push(item);
    }
    return out;
  }

  function sameValue(a, b) {
    return a === b || (Number.isNaN(a) && Number.isNaN(b));
  }

  class Env {
    constructor(map) {
      this.map = map || new Map();
    }

    bind(key, value) {
      const next = new Map(this.map);
      if (Array.isArray(key)) {
        next.set(key[0], key[1]);
      } else {
        next.set(key, value);
      }
      return new Env(next);
    }

    unbind(...keys) {
      const next = new Map(this.map);
      for (const key of keys) {
        next.delete(key);
      }
      return new Env(next);
    }

    get(key) {
      if (!this.map.has(key)) {
        throw new Error("Unbound key: " + key);
      }
      return this.map.get(key);
    }
  }

  function cloneArray(value) {
    return Array.isArray(value) ? value.slice() : value;
  }

  function jpLabel(kind) {
    return {
      call: "call",
      exec: "exec",
      init: "init",
      creation: "creation",
      get: "pr",
      set: "pw",
      varGet: "vr",
      varSet: "vw",
      event: "event",
    }[kind] || kind;
  }

  function nameFromInternal(internal) {
    if (internal.kind === "event") {
      return internal.eventType || "";
    }
    if (internal.name != null) {
      return String(internal.name);
    }
    if (internal.methods && internal.methods.length > 0) {
      return String(internal.methods[0]);
    }
    const fun = internal.fun;
    if (fun && fun.__asDeclaredName) {
      return fun.__asDeclaredName;
    }
    if (typeof fun === "function" && fun.name && fun.name !== "wrapped") {
      return fun.name;
    }
    return "";
  }

  function publicJoinPoint(internal, proceedImpl, metaLevel) {
    const clone = {
      target: internal.target,
      fun: internal.fun,
      name: internal.name,
      value: internal.value,
      args: cloneArray(internal.args) || [],
      methods: cloneArray(internal.methods) || [],
      finalResult: internal.finalResult,
      metaLevel,
      ctx: internal.ctx,
      eventType: internal.eventType,
      proceed: function proceed(...args) {
        return proceedImpl(...args);
      },
      clone: function cloneJP() {
        return publicJoinPoint(internal, proceedImpl, metaLevel);
      },
      isCall: function isCall() {
        return internal.kind === "call";
      },
      isExec: function isExec() {
        return internal.kind === "exec";
      },
      isInit: function isInit() {
        return internal.kind === "init";
      },
      isCreation: function isCreation() {
        return internal.kind === "creation";
      },
      isPropRead: function isPropRead() {
        return internal.kind === "get";
      },
      isPropWrite: function isPropWrite() {
        return internal.kind === "set" || internal.kind === "varSet";
      },
      isEvent: function isEvent() {
        return internal.kind === "event";
      },
      toString: function toString() {
        return "[" + jpLabel(internal.kind) + ": " + nameFromInternal(internal) + "]";
      },
    };
    Object.defineProperty(clone, "__asInternal", {
      value: internal,
      enumerable: false,
      configurable: true,
    });
    if (internal.kind === "event" && internal.ctx && typeof internal.ctx === "object") {
      Object.assign(clone, internal.ctx);
    }
    return Object.freeze(clone);
  }

  function annotateErrorWithJoinPoint(error, internal) {
    if (!error || (typeof error !== "object" && typeof error !== "function")) {
      return error;
    }
    if (error.__asAnnotated) {
      return error;
    }
    const jpLabelWithMeta = publicJoinPoint(internal, () => internal.finalResult, state.currentLevel).toString();
    const receiver = currentFrame() && currentFrame().receiver;
    const receiverName = receiver && receiver.constructor && receiver.constructor.name
      ? receiver.constructor.name
      : (receiver === globalObject ? "global" : typeof receiver);
    const contextLine = "[AspectScript] join point: " + jpLabelWithMeta +
      " | level: " + state.currentLevel +
      " | receiver: " + receiverName;
    if (typeof error.message === "string" && !error.message.includes(contextLine)) {
      error.message += "\n" + contextLine;
    }
    if (typeof error.stack === "string" && !error.stack.includes(contextLine)) {
      error.stack += "\n" + contextLine;
    }
    Object.defineProperty(error, "__asAnnotated", {
      value: true,
      configurable: true,
    });
    return error;
  }

  function isSuppressed(aspect) {
    if (aspect.allowReentrance) {
      return false;
    }
    for (let i = state.downStack.length - 1; i >= 0; i -= 1) {
      const frame = state.downStack[i];
      if (frame.level !== state.currentLevel) {
        continue;
      }
      if (frame.aspectIds.has(aspect.id)) {
        return true;
      }
    }
    return false;
  }

  function pointcutMatch(result, env) {
    if (result === false || result == null) {
      return false;
    }
    if (result === true) {
      return env;
    }
    return result instanceof Env ? result : env;
  }

  function makePointcut(fn) {
    if (fn && fn.__asPointcut) {
      return fn;
    }
    const pc = function pointcut(jp, env) {
      return fn(jp, env || AspectScript.emptyEnv);
    };
    Object.defineProperty(pc, "__asPointcut", { value: true });
    Object.defineProperty(pc, "__asRaw", { value: fn });
    pc.and = function and(other) {
      const rhs = makePointcut(other);
      return makePointcut(function andPC(jp, env) {
        const first = pointcutMatch(pc(jp, env), env);
        if (!first) {
          return false;
        }
        return rhs(jp, first);
      });
    };
    pc.or = function or(other) {
      const rhs = makePointcut(other);
      return makePointcut(function orPC(jp, env) {
        const first = pointcutMatch(pc(jp, env), env);
        if (first) {
          return first;
        }
        return rhs(jp, env);
      });
    };
    pc.not = function not() {
      return makePointcut(function notPC(jp, env) {
        return pc(jp, env) ? false : env;
      });
    };
    pc.inCFlowOf = function inCFlowOf(other) {
      return pc.and(Pointcuts.cflow(other));
    };
    return pc;
  }

  function functionNameMatch(jp, expected) {
    if (typeof expected === "function") {
      return jp.fun === expected;
    }
    return (jp.methods || []).includes(expected) ||
      nameFromInternal(jp) === expected ||
      (jp.fun && jp.fun.__asDeclaredName === expected);
  }

  const Pointcuts = {
    call(fun) {
      return makePointcut(function callPC(jp, env) {
        const internal = jp.__asInternal || jp;
        return internal.kind === "call" && functionNameMatch(jp, fun) ? env : false;
      });
    },
    exec(fun) {
      return makePointcut(function execPC(jp, env) {
        const internal = jp.__asInternal || jp;
        return internal.kind === "exec" && functionNameMatch(jp, fun) ? env : false;
      });
    },
    init(fun) {
      return makePointcut(function initPC(jp, env) {
        const internal = jp.__asInternal || jp;
        return internal.kind === "init" && functionNameMatch(jp, fun) ? env : false;
      });
    },
    creation(fun) {
      return makePointcut(function creationPC(jp, env) {
        const internal = jp.__asInternal || jp;
        return internal.kind === "creation" && functionNameMatch(jp, fun) ? env : false;
      });
    },
    get(target, name) {
      const byNameOnly = arguments.length === 1;
      if (arguments.length === 1) {
        name = target;
        target = null;
      }
      return makePointcut(function getPC(jp, env) {
        const internal = jp.__asInternal || jp;
        if (byNameOnly) {
          if (internal.kind !== "varGet") {
            return false;
          }
        } else if (internal.kind !== "get" && internal.kind !== "varGet") {
          return false;
        }
        if (name != null && name !== "*" && internal.name !== name) {
          return false;
        }
        if (target == null || target === "*") {
          return env;
        }
        return internal.target === target ? env : false;
      });
    },
    set(target, name) {
      const byNameOnly = arguments.length === 1;
      if (arguments.length === 1) {
        name = target;
        target = null;
      }
      return makePointcut(function setPC(jp, env) {
        const internal = jp.__asInternal || jp;
        if (byNameOnly) {
          if (internal.kind !== "varSet") {
            return false;
          }
        } else if (internal.kind !== "set" && internal.kind !== "varSet") {
          return false;
        }
        if (name != null && name !== "*" && internal.name !== name) {
          return false;
        }
        if (target == null || target === "*") {
          return env;
        }
        return internal.target === target ? env : false;
      });
    },
    event(type) {
      return makePointcut(function eventPC(jp, env) {
        const internal = jp.__asInternal || jp;
        return internal.kind === "event" && internal.eventType === type ? env : false;
      });
    },
    cflow(other) {
      const pc = makePointcut(other);
      return makePointcut(function cflowPC(jp, env) {
        let parent = (jp.__asInternal || jp).parent;
        while (parent) {
          if (pc(publicJoinPoint(parent, () => parent.finalResult, state.currentLevel), env)) {
            return env;
          }
          parent = parent.parent;
        }
        return false;
      });
    },
    within(target) {
      return makePointcut(function withinPC(jp, env) {
        const internal = jp.__asInternal || jp;
        return internal.withinObjects && internal.withinObjects.includes(target) ? env : false;
      });
    },
    noBR(other, ctxFn) {
      const pc = makePointcut(other);
      const ctx = ctxFn || function defaultCtx() {
        return null;
      };
      return makePointcut(function noBRPC(jp, env) {
        const internal = jp.__asInternal || jp;
        let parent = internal.parent;
        const token = ctx(jp);
        while (parent) {
          const records = parent.__asNoBRMatches || [];
          for (const record of records) {
            if (record.pointcut === pc && sameValue(record.token, token)) {
              return false;
            }
          }
          parent = parent.parent;
        }
        const matched = pointcutMatch(pc(jp, env), env);
        if (!matched) {
          return false;
        }
        if (!internal.__asNoBRMatches) {
          internal.__asNoBRMatches = [];
        }
        internal.__asNoBRMatches.push({ pointcut: pc, token });
        return matched;
      });
    },
  };

  function makeAspect(kind, pointcut, advice, option) {
    return {
      kind,
      pointcut: makePointcut(pointcut),
      advice,
      option,
    };
  }

  function createDeployment(spec) {
    const [c, d, f] = normalizeStrategy(spec.strategy);
    return {
      id: state.nextAspectId++,
      kind: spec.kind,
      pointcut: makePointcut(spec.pointcut),
      advice: spec.advice,
      level: spec.level,
      allowReentrance: spec.allowReentrance === true,
      c,
      d,
      f,
    };
  }

  function addDeployment(target, deployment) {
    if (!deployment.__asTarget) {
      deployment.__asTarget = target;
    }
    ensureAspectList(target).push(deployment);
    return deployment;
  }

  function removeDeployment(target, deployment) {
    const list = ensureAspectList(target);
    const index = list.indexOf(deployment);
    if (index >= 0) {
      list.splice(index, 1);
    }
  }

  function deploy(...args) {
    let strategy = null;
    let aspect = null;
    let thunk = null;
    if (Array.isArray(args[0])) {
      strategy = args[0];
      aspect = args[1];
      thunk = args[2];
    } else {
      aspect = args[0];
      if (typeof args[1] === "function") {
        thunk = args[1];
        strategy = args[2] || [true, false, true];
      }
    }
    const deployment = createDeployment({
      kind: aspect.kind,
      pointcut: aspect.pointcut,
      advice: aspect.advice,
      allowReentrance: aspect.option === true,
      level: state.currentLevel,
      strategy,
    });
    if (thunk) {
      currentFrame().dynamicAspects = currentFrame().dynamicAspects.concat([deployment]);
      try {
        return thunk();
      } finally {
        currentFrame().dynamicAspects = currentFrame().dynamicAspects.filter((item) => item !== deployment);
      }
    }
    state.globalDeployments.push(deployment);
    return deployment;
  }

  function undeploy(deployment) {
    const index = state.globalDeployments.indexOf(deployment);
    if (index >= 0) {
      state.globalDeployments.splice(index, 1);
      return;
    }
    const frame = currentFrame();
    frame.dynamicAspects = frame.dynamicAspects.filter((item) => item !== deployment);
  }

  function deployOn(...args) {
    let strategy = null;
    let aspect = null;
    let target = null;
    if (Array.isArray(args[0])) {
      strategy = args[0];
      aspect = args[1];
      target = args[2];
    } else {
      aspect = args[0];
      target = args[1];
      strategy = args[2];
    }
    const deployment = createDeployment({
      kind: aspect.kind,
      pointcut: aspect.pointcut,
      advice: aspect.advice,
      allowReentrance: aspect.option === true,
      level: state.currentLevel,
      strategy,
    });
    addDeployment(target, deployment);
    deployment.__asTarget = target;
    return deployment;
  }

  function aspectsFromLexicalContexts() {
    const frame = currentFrame();
    const collected = [];
    for (const obj of frame.lexicalObjects) {
      collected.push(...ensureAspectList(obj));
    }
    for (const fn of frame.lexicalFunctions) {
      collected.push(...ensureAspectList(fn));
    }
    return collected;
  }

  function currentVisibleAspects() {
    const frame = currentFrame();
    return uniqueById([
      ...state.globalDeployments,
      ...frame.dynamicAspects,
      ...aspectsFromLexicalContexts(),
    ]).filter((aspect) => {
      if (aspect.__asTarget === globalObject &&
          frame.receiver &&
          frame.receiver !== globalObject) {
        return false;
      }
      return aspect.level === state.currentLevel && !isSuppressed(aspect);
    });
  }

  function evaluatePointcut(aspect, internal, env) {
    if (!aspect.f(internal)) {
      return false;
    }
    const previousAspect = state.currentAspect;
    const previousLevel = state.currentLevel;
    state.currentAspect = aspect;
    state.currentLevel = aspect.level + 1;
    try {
      return pointcutMatch(aspect.pointcut(publicJoinPoint(internal, () => internal.finalResult, aspect.level + 1), env), env);
    } finally {
      state.currentAspect = previousAspect;
      state.currentLevel = previousLevel;
    }
  }

  function invokeAdvice(aspect, internal, env, proceedImpl) {
    const previousAspect = state.currentAspect;
    const previousLevel = state.currentLevel;
    state.currentAspect = aspect;
    state.currentLevel = aspect.level + 1;
    try {
      const proceedAtJoinPointLevel = (...args) => {
        const levelBeforeProceed = state.currentLevel;
        state.currentLevel = aspect.level;
        try {
          return proceedImpl(...args);
        } finally {
          state.currentLevel = levelBeforeProceed;
        }
      };
      return aspect.advice(publicJoinPoint(internal, proceedAtJoinPointLevel, aspect.level + 1), env);
    } finally {
      state.currentAspect = previousAspect;
      state.currentLevel = previousLevel;
    }
  }

  function runAfterAdvice(aspect, internal, proceedImpl) {
    const env = evaluatePointcut(aspect, internal, AspectScript.emptyEnv);
    if (!env) {
      return;
    }
    invokeAdvice(aspect, internal, env, proceedImpl);
  }

  function weave(internal, baseProceed) {
    const applicable = currentVisibleAspects();
    const beforeAndAround = [];
    const afters = [];
    for (const aspect of applicable) {
      if (aspect.kind === AspectScript.AFTER) {
        afters.push(aspect);
      } else {
        const env = evaluatePointcut(aspect, internal, AspectScript.emptyEnv);
        if (env) {
          beforeAndAround.push({ aspect, env });
        }
      }
    }
    pushTrace({
      label: publicJoinPoint(internal, () => internal.finalResult, state.currentLevel).toString(),
      kind: internal.kind,
      matched: beforeAndAround.length + afters.length > 0,
      beforeOrAroundMatches: beforeAndAround.length,
      afterMatches: afters.length,
    });

    const joinPointFrame = currentFrame();
    const executeBase = (...args) => {
      const previousJP = state.currentJP;
      const activeFrame = currentFrame();
      const switchedFrame = activeFrame !== joinPointFrame;
      if (switchedFrame) {
        state.frameStack.push(joinPointFrame);
      }
      state.currentJP = internal;
      try {
        return baseProceed(...args);
      } finally {
        state.currentJP = previousJP;
        if (switchedFrame) {
          state.frameStack.pop();
        }
      }
    };

    let chain = function base(...args) {
      return executeBase(...args);
    };

    let orderedBeforeAndAround = beforeAndAround;
    if (beforeAndAround.length > 1 &&
        beforeAndAround.every((item) => item.aspect.kind === AspectScript.BEFORE)) {
      const noArgBefore = [];
      const withArgBefore = [];
      for (const item of beforeAndAround) {
        const rawAdvice = item.aspect.advice && item.aspect.advice.__asOriginal
          ? item.aspect.advice.__asOriginal
          : item.aspect.advice;
        if (!rawAdvice || rawAdvice.length === 0) {
          noArgBefore.push(item);
        } else {
          withArgBefore.push(item);
        }
      }
      orderedBeforeAndAround = noArgBefore.concat(withArgBefore);
    }

    for (const item of orderedBeforeAndAround) {
      const next = chain;
      const aspect = item.aspect;
      const env = item.env;
      if (aspect.kind === AspectScript.BEFORE) {
        chain = function beforeChain(...args) {
          invokeAdvice(aspect, internal, env, (...proceedArgs) => next(...(proceedArgs.length ? proceedArgs : args)));
          return next(...args);
        };
      } else {
        chain = function aroundChain(...args) {
          return invokeAdvice(aspect, internal, env, (...proceedArgs) => next(...(proceedArgs.length ? proceedArgs : args)));
        };
      }
    }

    try {
      const result = chain(...(internal.args || []));
      internal.finalResult = result;
      internal.value = internal.kind === "get" || internal.kind === "varGet" ? result : internal.value;
      for (const aspect of afters) {
        runAfterAdvice(aspect, internal, (...proceedArgs) => executeBase(...(proceedArgs.length ? proceedArgs : (internal.args || []))));
      }
      return result;
    } catch (error) {
      throw annotateErrorWithJoinPoint(error, internal);
    }
  }

  function captureLexicalObjects() {
    return uniqueById(currentFrame().lexicalObjects.map((obj, index) => ({ id: index + 1, value: obj })))
      .map((entry) => entry.value);
  }

  function captureLexicalFunctions() {
    return currentFrame().lexicalFunctions.slice();
  }

  function markFunctionMetadata(fn, declaredName) {
    if (!fn || typeof fn !== "function") {
      return fn;
    }
    if (!fn.__asWrapped) {
      Object.defineProperty(fn, "__asWrapped", { value: true });
      Object.defineProperty(fn, "__asDeclaredName", {
        value: declaredName || fn.name || "",
        writable: true,
        configurable: true,
      });
      Object.defineProperty(fn, "__asCapturedObjects", {
        value: captureLexicalObjects(),
        writable: true,
        configurable: true,
      });
      Object.defineProperty(fn, "__asCapturedFunctions", {
        value: captureLexicalFunctions(),
        writable: true,
        configurable: true,
      });
      Object.defineProperty(fn, "__asMethodNames", {
        value: declaredName ? [declaredName] : [],
        writable: true,
        configurable: true,
      });
    }
    return fn;
  }

  function setFunctionOwner(target, key, value) {
    if (typeof value === "function" && target !== globalObject) {
      markFunctionMetadata(value, value.__asDeclaredName || (typeof key === "string" ? key : ""));
      value.__asOwner = target;
      if (typeof key === "string" && !value.__asMethodNames.includes(key)) {
        value.__asMethodNames = [key].concat(value.__asMethodNames.filter((name) => name !== key));
      }
    }
    return value;
  }

  function wrap(fn, declaredName) {
    markFunctionMetadata(fn, declaredName);
    function wrapped(...args) {
      const pending = state.pendingCalls[state.pendingCalls.length - 1];
      const methods = pending && pending.fun === wrapped ? pending.methods : wrapped.__asMethodNames || [];
      const target = pending && pending.fun === wrapped ? pending.target : this;
      const parent = state.currentJP;
      const internal = {
        kind: "exec",
        target,
        fun: wrapped,
        args: args.slice(),
        methods: methods.slice(),
        parent,
        withinObjects: currentFrame().lexicalObjects.slice(),
      };
      const nextDynamicAspects = pending && pending.fun === wrapped ? pending.dynamicAspects : currentFrame().dynamicAspects.slice();
      const frame = {
        lexicalObjects: uniqueById([
          ...wrapped.__asCapturedObjects.map((value, index) => ({ id: index + 1, value })),
          ...(wrapped.__asOwner ? [{ id: 1000000, value: wrapped.__asOwner }] : []),
        ]).map((entry) => entry.value),
        lexicalFunctions: uniqueById([
          ...wrapped.__asCapturedFunctions.map((value, index) => ({ id: index + 1, value })),
          { id: 2000000, value: wrapped },
        ]).map((entry) => entry.value),
        dynamicAspects: uniqueById(nextDynamicAspects),
        receiver: target,
      };
      const original = fn;
      const previousPending = state.pendingCalls[state.pendingCalls.length - 1];
      if (previousPending && previousPending.fun === wrapped) {
        state.pendingCalls.pop();
      }
      state.frameStack.push(frame);
      try {
        return weave(internal, (...overrideArgs) => original.apply(target, overrideArgs.length ? overrideArgs : args));
      } finally {
        state.frameStack.pop();
      }
    }
    Object.defineProperty(wrapped, "__asWrapped", { value: true });
    Object.defineProperty(wrapped, "__asOriginal", {
      value: fn,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(wrapped, "__asDeclaredName", {
      value: declaredName || fn.name || "",
      writable: true,
      configurable: true,
    });
    Object.defineProperty(wrapped, "__asCapturedObjects", {
      value: fn.__asCapturedObjects || captureLexicalObjects(),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(wrapped, "__asCapturedFunctions", {
      value: fn.__asCapturedFunctions || captureLexicalFunctions(),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(wrapped, "__asMethodNames", {
      value: fn.__asMethodNames || (declaredName ? [declaredName] : []),
      writable: true,
      configurable: true,
    });
    wrapped.prototype = fn.prototype;
    if (wrapped.prototype && wrapped.prototype.constructor === fn) {
      wrapped.prototype.constructor = wrapped;
    }
    return wrapped;
  }

  function computePropagation(callJP) {
    return currentVisibleAspects().filter((aspect) => aspect.c(callJP));
  }

  function call(target, fun, args, methods) {
    const internal = {
      kind: "call",
      target,
      fun,
      args: args.slice(),
      methods: methods.slice(),
      parent: state.currentJP,
      withinObjects: currentFrame().lexicalObjects.slice(),
    };
    return weave(internal, (...overrideArgs) => {
      const actualArgs = overrideArgs.length ? overrideArgs : args;
      state.pendingCalls.push({
        fun,
        target,
        methods: methods.slice(),
        dynamicAspects: computePropagation(internal),
      });
      try {
        return fun.apply(target, actualArgs);
      } finally {
        if (state.pendingCalls[state.pendingCalls.length - 1] && state.pendingCalls[state.pendingCalls.length - 1].fun === fun) {
          state.pendingCalls.pop();
        }
      }
    });
  }

  function callProp(target, name, args, methods) {
    const fun = getProp(target, name);
    return call(target, fun, args, methods);
  }

  function explicitCall(fun, target, args, methods) {
    return call(target, fun, args, methods);
  }

  function explicitApply(fun, target, args, methods) {
    return call(target, fun, Array.isArray(args) ? args : [], methods);
  }

  function newObject(constructor, args, methods) {
    const creationJP = {
      kind: "creation",
      target: null,
      fun: constructor,
      args: args.slice(),
      methods: methods.slice(),
      parent: state.currentJP,
      withinObjects: currentFrame().lexicalObjects.slice(),
    };
    return weave(creationJP, (...overrideArgs) => {
      const actualArgs = overrideArgs.length ? overrideArgs : args;
      if (!constructor.__asOriginal) {
        const nativeResult = Reflect.construct(constructor, actualArgs);
        return typeof nativeResult === "function" ? wrap(nativeResult, nativeResult.name || "") : nativeResult;
      }
      const originalConstructor = constructor.__asOriginal;
      const target = Object.create(constructor.prototype || Object.prototype);
      const initJP = {
        kind: "init",
        target,
        fun: constructor,
        args: actualArgs.slice(),
        methods: methods.slice(),
        parent: state.currentJP,
        withinObjects: currentFrame().lexicalObjects.slice(),
      };
      for (const aspect of currentVisibleAspects()) {
        if (aspect.d(initJP)) {
          addDeployment(target, createDeployment({
            kind: aspect.kind,
            pointcut: aspect.pointcut,
            advice: aspect.advice,
            allowReentrance: aspect.allowReentrance,
            level: aspect.level,
            strategy: [aspect.c, aspect.d, aspect.f],
          }));
        }
      }
      const result = weave(initJP, (...proceedArgs) => {
        const usedArgs = proceedArgs.length ? proceedArgs : actualArgs;
        state.pendingCalls.push({
          fun: constructor,
          target,
          methods: methods.slice(),
          dynamicAspects: computePropagation({
            kind: "call",
            target,
            fun: constructor,
            args: usedArgs,
            methods: methods.slice(),
            parent: state.currentJP,
            withinObjects: currentFrame().lexicalObjects.slice(),
          }),
        });
        try {
          const returned = originalConstructor.apply(target, usedArgs);
          const finalValue = returned && (typeof returned === "object" || typeof returned === "function") ? returned : target;
          if (typeof finalValue === "function") {
            return wrap(finalValue, finalValue.name || "");
          }
          return finalValue;
        } finally {
          state.pendingCalls.pop();
        }
      });
      creationJP.target = result;
      return result;
    });
  }

  function getProp(target, name) {
    const internal = {
      kind: "get",
      target,
      name,
      methods: [],
      args: [],
      parent: state.currentJP,
      withinObjects: currentFrame().lexicalObjects.slice(),
    };
    return weave(internal, () => target[name]);
  }

  function setProp(target, name, value) {
    const internal = {
      kind: "set",
      target,
      name,
      value,
      methods: [],
      args: [],
      parent: state.currentJP,
      withinObjects: currentFrame().lexicalObjects.slice(),
    };
    return weave(internal, (overrideValue) => {
      const assigned = overrideValue !== undefined ? overrideValue : value;
      target[name] = setFunctionOwner(target, name, assigned);
      internal.value = assigned;
      return assigned;
    });
  }

  function getVar(scope, name, getter, mode) {
    const kind = mode === "global" ? "get" : "varGet";
    const internal = {
      kind,
      target: scope,
      name,
      methods: [],
      args: [],
      parent: state.currentJP,
      withinObjects: currentFrame().lexicalObjects.slice(),
    };
    return weave(internal, getter);
  }

  function setVar(scope, name, value, setter, mode) {
    const kind = mode === "global" ? "set" : "varSet";
    const internal = {
      kind,
      target: scope,
      name,
      value,
      methods: [],
      args: [],
      parent: state.currentJP,
      withinObjects: currentFrame().lexicalObjects.slice(),
    };
    return weave(internal, (overrideValue) => {
      const assigned = overrideValue !== undefined ? overrideValue : value;
      internal.value = assigned;
      return setter(assigned);
    });
  }

  function updateVar(scope, name, getter, setter, delta, prefix, mode) {
    const current = getVar(scope, name, getter, mode);
    const next = current + delta;
    setVar(scope, name, next, setter, mode);
    return prefix ? next : current;
  }

  function updateProp(target, name, delta, prefix) {
    const current = getProp(target, name);
    const next = current + delta;
    setProp(target, name, next);
    return prefix ? next : current;
  }

  function deleteProp(target, name) {
    return delete target[name];
  }

  function makeObjectLiteral(entries) {
    const target = {};
    const initJP = {
      kind: "init",
      target,
      fun: Object,
      args: [],
      methods: [],
      parent: state.currentJP,
      withinObjects: currentFrame().lexicalObjects.slice(),
    };
    for (const aspect of currentVisibleAspects()) {
      if (aspect.d(initJP)) {
        addDeployment(target, createDeployment({
          kind: aspect.kind,
          pointcut: aspect.pointcut,
          advice: aspect.advice,
          allowReentrance: aspect.allowReentrance,
          level: aspect.level,
          strategy: [aspect.c, aspect.d, aspect.f],
        }));
      }
    }
    for (const entry of entries) {
      setProp(target, entry.key, entry.value);
    }
    return target;
  }

  function scope(name) {
    return { __asScope: true, __asScopeId: state.nextScopeId++, __asName: name || "" };
  }

  function up(thunk) {
    state.currentLevel += 1;
    try {
      return thunk();
    } finally {
      state.currentLevel -= 1;
    }
  }

  function down(thunk) {
    const previousLevel = state.currentLevel;
    const lowered = Math.max(0, previousLevel - 1);
    const aspectIds = new Set();
    if (state.currentAspect && !state.currentAspect.allowReentrance) {
      aspectIds.add(state.currentAspect.id);
    }
    state.currentLevel = lowered;
    state.downStack.push({ level: lowered, aspectIds });
    try {
      return thunk();
    } finally {
      state.downStack.pop();
      state.currentLevel = previousLevel;
    }
  }

  function event(type, ctx, block) {
    const internal = {
      kind: "event",
      eventType: type,
      ctx,
      target: globalObject,
      methods: [],
      args: [],
      parent: state.currentJP,
      withinObjects: currentFrame().lexicalObjects.slice(),
    };
    return weave(internal, (...overrideArgs) => block.apply(globalObject, overrideArgs));
  }

  const tracer = {
    enable() {
      state.traceEnabled = true;
      state.traceEntries = [];
    },
    disable() {
      state.traceEnabled = false;
    },
    reset() {
      state.traceEntries = [];
    },
    getEntries() {
      return state.traceEntries.slice();
    },
    dump() {
      return state.traceEntries.slice();
    },
    toJSON(pretty) {
      return JSON.stringify(state.traceEntries, null, pretty ? 2 : 0);
    },
    saveToFile(filePath, pretty) {
      if (typeof require !== "function") {
        throw new Error("saveToFile is only available in Node.js environments");
      }
      const fs = require("fs");
      fs.writeFileSync(String(filePath), JSON.stringify(state.traceEntries, null, pretty === false ? 0 : 2), "utf8");
    },
  };

  const i13n = {};
  for (const key of ["wrap", "call", "call2", "propWrite", "propWrite2", "withPush", "withPop", "objectInWithHasProperty", "uncertainWrite"]) {
    i13n[key] = function notExposed() {
      throw new Error("Instrumentation helper is internal");
    };
  }

  const AspectScript = {
    BEFORE: "before",
    AROUND: "around",
    AFTER: "after",
    Pointcuts,
    emptyEnv: new Env(),
    globalObject,
    tracer,
    i13n,
    Env,
    aspect(kind, pointcut, advice, option) {
      return makeAspect(kind, pointcut, advice, option);
    },
    before(pointcut, advice, option) {
      return deploy(makeAspect(AspectScript.BEFORE, pointcut, advice, option));
    },
    around(pointcut, advice, option) {
      return deploy(makeAspect(AspectScript.AROUND, pointcut, advice, option));
    },
    after(pointcut, advice, option) {
      return deploy(makeAspect(AspectScript.AFTER, pointcut, advice, option));
    },
    deploy,
    undeploy,
    deployOn,
    up,
    down,
    event,
    __wrapFunction: wrap,
    __call: call,
    __callProp: callProp,
    __explicitCall: explicitCall,
    __explicitApply: explicitApply,
    __new: newObject,
    __getProp: getProp,
    __setProp: setProp,
    __getVar: getVar,
    __setVar: setVar,
    __updateVar: updateVar,
    __updateProp: updateProp,
    __deleteProp: deleteProp,
    __makeObjectLiteral: makeObjectLiteral,
    __scope: scope,
  };

  if (typeof createESAExtension === "function") {
    const ESA = createESAExtension(AspectScript);
    AspectScript.ESA = ESA;
    AspectScript.PTs = ESA.Pointcuts;
    if (runtimeGlobal && (typeof runtimeGlobal === "object" || typeof runtimeGlobal === "function")) {
      runtimeGlobal.ESA = ESA;
      runtimeGlobal.PTs = ESA.Pointcuts;
    }
  }

  AspectScript.createAspectScript = createAspectScript;

  return AspectScript;
}

const AspectScript = createAspectScript(globalThis);

globalThis.AspectScript = AspectScript;

if (typeof module !== "undefined" && module.exports) {
  module.exports = AspectScript;
  module.exports.createAspectScript = createAspectScript;
}
