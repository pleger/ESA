function createESA(AspectScript) {
  function OwnArrayEnv() {
    for (let i = 0; i < arguments.length; i += 1) {
      this.push(arguments[i]);
    }
  }
  OwnArrayEnv.prototype = Object.create(Array.prototype);
  OwnArrayEnv.prototype.constructor = OwnArrayEnv;

  const ESA = {};

  const emptyEnv = ESA.emptyEnv = {
    bind(name, value) {
      const env = Object.create(this);
      if (env[name] === undefined) {
        env[name] = value;
      } else if (env[name] instanceof OwnArrayEnv) {
        env[name].push(value);
      } else {
        env[name] = new OwnArrayEnv(env[name], value);
      }
      return env;
    },
    unbind(name) {
      const env = Object.create(this);
      env[name] = undefined;
      return env;
    },
    replace(name, value) {
      const env = Object.create(this);
      env[name] = value;
      return env;
    },
  };

  const SKIPPED_ENV_KEYS = {
    bind: true,
    unbind: true,
    replace: true,
    toString: true,
  };

  function isEnv(result) {
    return result === true || result === emptyEnv || emptyEnv.isPrototypeOf(result);
  }

  function applyFluentInterface(fun) {
    if (fun.and && fun.or && fun.inCFlowOf && fun.not) {
      return fun;
    }

    fun.and = function and(right) {
      const left = this;
      return wrapPattern(function andPattern(jp, env) {
        const newEnv = left.call(this, jp, env);
        if (!newEnv) {
          return false;
        }
        return right.call(this, jp, newEnv);
      });
    };

    fun.or = function or(right) {
      const left = this;
      return wrapPattern(function orPattern(jp, env) {
        const newEnv = left.call(this, jp, env);
        if (!newEnv) {
          return right.call(this, jp, env);
        }
        return newEnv;
      });
    };

    fun.not = function not() {
      const left = this;
      return wrapPattern(function notPattern(jp, env) {
        const result = left.call(this, jp, env);
        return result ? false : env;
      });
    };

    fun.inCFlowOf = function inCFlowOf(pc) {
      return this.and(PTs.cflow(pc));
    };

    return fun;
  }

  function wrapPattern(pattern) {
    return applyFluentInterface(function wrappedPattern(jp, env) {
      const currentEnv = env || emptyEnv;
      const result = pattern.call(this, jp, currentEnv);
      if (isEnv(result)) {
        return result === true ? currentEnv : result;
      }
      return result ? currentEnv : false;
    });
  }

  function functionNameMatch(jp, expected) {
    if (expected === "*") {
      return true;
    }
    if (typeof expected === "string") {
      return (jp.methods || []).indexOf(expected) >= 0 ||
        jp.name === expected ||
        (jp.fun && jp.fun.__asDeclaredName === expected);
    }
    return jp.fun === expected;
  }

  let PTs = {
    within(target) {
      return wrapPattern(function withinPattern(jp) {
        let parent = jp.parent;
        while (parent != null) {
          if (parent.target === target) {
            return true;
          }
          parent = parent.parent;
        }
        return false;
      });
    },

    get(target, name) {
      if (arguments.length === 1) {
        name = target;
        return wrapPattern(function getVarPattern(jp, env) {
          const internal = jp.__asInternal || jp;
          if (internal.kind !== "varGet") {
            return false;
          }
          return internal.name === name || name === "*" ? env : false;
        });
      }

      return wrapPattern(function getPattern(jp, env) {
        if (!jp.isPropRead()) {
          return false;
        }
        if ((target !== "*" && jp.target !== target) ||
            (name !== "*" && jp.name !== name)) {
          return false;
        }
        return env;
      });
    },

    set(target, name) {
      if (arguments.length === 1) {
        name = target;
        return wrapPattern(function setVarPattern(jp, env) {
          const internal = jp.__asInternal || jp;
          if (internal.kind !== "varSet") {
            return false;
          }
          return internal.name === name || name === "*" ? env : false;
        });
      }

      return wrapPattern(function setPattern(jp, env) {
        if (!jp.isPropWrite()) {
          return false;
        }
        if ((target !== "*" && jp.target !== target) ||
            (name !== "*" && jp.name !== name)) {
          return false;
        }
        return env;
      });
    },

    creation(fun) {
      return wrapPattern(function creationPattern(jp, env) {
        return jp.isCreation() && functionNameMatch(jp, fun) ? env : false;
      });
    },

    init(fun) {
      return wrapPattern(function initPattern(jp, env) {
        return jp.isInit() && functionNameMatch(jp, fun) ? env : false;
      });
    },

    call(arg) {
      return wrapPattern(function callPattern(jp, env) {
        return jp.isCall() && functionNameMatch(jp, arg) ? env : false;
      });
    },

    exec(arg) {
      return wrapPattern(function execPattern(jp, env) {
        return jp.isExec() && functionNameMatch(jp, arg) ? env : false;
      });
    },

    event(type) {
      return wrapPattern(function eventPattern(jp, env) {
        return jp.isEvent() && jp.eventType === type ? env : false;
      });
    },

    target(obj) {
      return wrapPattern(function targetPattern(jp, env) {
        if (obj === "*" && jp.target !== undefined) {
          return env;
        }
        return jp.target === obj ? env : false;
      });
    },

    cflow(pc) {
      return wrapPattern(function cflowPattern(jp, env) {
        let current = jp;
        while (current != null) {
          const result = pc(current, env);
          if (result) {
            return result;
          }
          current = current.parent;
        }
        return false;
      });
    },

    cflowbelow(pc) {
      return wrapPattern(function cflowBelowPattern(jp, env) {
        return jp && jp.parent ? PTs.cflow(pc)(jp.parent, env) : false;
      });
    },

    not(pc) {
      return wrapPattern(function notPattern(jp, env) {
        return pc(jp, env) ? false : env;
      });
    },

    seq(left, right) {
      return function seqPattern(jp, env) {
        const res = left(jp, env);
        if (resultLib.isEnv(res)) {
          return [right, res === true ? env : res];
        }

        if (resultLib.isPair(res)) {
          return [PTs.seq(res[0], right), res[1] === true ? env : res[1]];
        }

        return false;
      };
    },

    seqN() {
      if (arguments.length === 2 && typeof arguments[1] === "number") {
        const subSeq = arguments[0];
        const n = arguments[1];

        let mainSeq = subSeq;
        for (let i = 0; i < n - 1; i += 1) {
          mainSeq = PTs.seq(subSeq, mainSeq);
        }

        return mainSeq;
      }

      const args = Array.prototype.slice.call(arguments);
      return args.reduce(function reduceSeq(previous, current) {
        return PTs.seq(previous, current);
      });
    },

    or(left, right) {
      return function orPattern(jp, env) {
        const resL = left(jp, env);
        if (resultLib.isEnv(resL)) {
          return resL;
        }

        const resR = right(jp, env);
        if (resultLib.isEnv(resR)) {
          return resR;
        }

        if (resultLib.isPair(resL) || resultLib.isPair(resR)) {
          const newLeft = resultLib.isPair(resL) ? resL[0] : left;
          const newRight = resultLib.isPair(resR) ? resR[0] : right;
          const newEnv = envLib.resultsToJoinedEnv(resL, resR);
          return [PTs.or(newLeft, newRight), newEnv];
        }

        return false;
      };
    },

    anyOrder(sequences) {
      return function anyOrderPattern(jp, env) {
        if (sequences.length === 1) {
          return sequences[0](jp, env);
        }

        const results = sequences.map(function mapResult(seqExp) {
          return seqExp(jp, env);
        });

        let newEnv = env;
        const newSeqExps = [];

        results.forEach(function eachResult(result, index) {
          if (resultLib.isEnv(result)) {
            newEnv = envLib.join(newEnv, result);
          } else if (resultLib.isPair(result)) {
            newEnv = envLib.join(newEnv, result[1]);
            newSeqExps.push(result[0]);
          } else {
            newSeqExps.push(sequences[index]);
          }
        });

        return newSeqExps.length > 0 ? [PTs.anyOrder(newSeqExps), newEnv] : false;
      };
    },

    starUntil(star, until) {
      function starUntilPattern(jp, env) {
        const resultUntil = until(jp, env);
        if (resultLib.isEnv(resultUntil)) {
          return resultUntil;
        }

        const resultStar = star(jp, env);
        if (resultLib.isEnv(resultStar)) {
          return [starUntilPattern, resultStar];
        }

        return false;
      }

      return starUntilPattern;
    },

    plusUntil(plus, until) {
      return PTs.seq(plus, PTs.starUntil(plus, until));
    },

    repeatUntil(repeat, until, repeatInitial) {
      const initial = repeatInitial === undefined ? repeat : repeatInitial;

      return function repeatUntilPattern(jp, env) {
        let newUntil;
        let newRepeat;
        let newEnv;

        const resU = until(jp, env);
        if (resultLib.isEnv(resU)) {
          return envLib.join(env, resU);
        }

        const resR = repeat(jp, env);
        if (resultLib.isEnv(resR)) {
          newUntil = resultLib.isPair(resU) ? resU[0] : until;
          newEnv = resultLib.isPair(resU) ? envLib.join(resR, resU[1]) : resR;
          return [PTs.repeatUntil(repeat, newUntil, initial), resR];
        }

        if (resultLib.isPair(resR) || resultLib.isPair(resU)) {
          newRepeat = resultLib.isPair(resR) ? resR[0] : repeat;
          newUntil = resultLib.isPair(resU) ? resU[0] : until;
          newEnv = envLib.resultsToJoinedEnv(resR, resU);
          return [PTs.repeatUntil(newRepeat, newUntil, initial), newEnv];
        }

        return false;
      };
    },

    repeatUntil_paperExample(repeat, until) {
      return function repeatUntilPaper(jp, env) {
        const resultUntil = until(jp, env);
        if (resultLib.isEnv(resultUntil)) {
          return resultUntil;
        }

        const resultRepeat = repeat(jp, env);
        if (resultLib.isEnv(resultRepeat)) {
          return [PTs.repeatUntil_paperExample(repeat, until), resultRepeat];
        }

        return false;
      };
    },
  };

  const PTsShim = function PTsShim() {
    return PTs.call(this);
  };
  Object.assign(PTsShim, PTs);
  PTs = PTsShim;
  ESA.Pointcuts = PTs;
  ESA.Patterns = PTs;
  ESA.Sequences = PTs;

  const Cell = function Cell(pattern, env, creator) {
    this.pattern = pattern;
    this.env = env;
    this.creator = creator;
  };

  Cell.prototype.isMatch = function isMatch() {
    return this.pattern === null;
  };

  Cell.prototype.isSeed = function isSeed() {
    return this.creator === null;
  };

  Cell.prototype.react = function react(jp, creation) {
    const result = this.pattern(jp, this.env);

    if (resultLib.isEnv(result)) {
      const finalEnv = result === true ? this.env : result;
      return new Cell(null, creation(finalEnv, null, this), this);
    }

    if (resultLib.isPair(result)) {
      const finalEnv = result[1] === true ? this.env : result[1];
      return new Cell(result[0], creation(finalEnv, result[0], this), this);
    }

    return this;
  };

  function weave(statefulAspect, jp) {
    const tempCells = statefulAspect.matching(statefulAspect.cells, jp);
    statefulAspect.cells = cellLib.noMatchCells(tempCells);
    return cellLib.matchCells(tempCells);
  }

  function patternOf(statefulAspect) {
    return statefulAspect.pattern || statefulAspect.sequence;
  }

  function statefulAspectToAspect(statefulAspect) {
    let matchCells = [];
    return {
      kind: statefulAspect.kind,
      pointcut(jp) {
        matchCells = weave(statefulAspect, jp);
        return matchCells.length > 0;
      },
      advice(jp) {
        return statefulAspect.advising(matchCells, jp, statefulAspect.advice);
      },
    };
  }

  ESA.deploy = function deploy(statefulAspect) {
    const pattern = patternOf(statefulAspect);
    if (!pattern) {
      throw new Error("Stateful aspect requires a 'pattern' (or legacy 'sequence').");
    }

    statefulAspect.pattern = pattern;
    statefulAspect.matching = statefulAspect.matching || matching.oneAtATime(pattern);
    statefulAspect.advising = statefulAspect.advising || advising.single;
    statefulAspect.cells = [cellLib.seed(pattern)];

    return AspectScript.deploy(statefulAspectToAspect(statefulAspect));
  };

  ESA.undeploy = function undeploy(handler) {
    AspectScript.undeploy(handler);
  };

  const rules = ESA.rules = {
    applyReaction(creation) {
      const cellCreation = creation || function defaultCreation(env) {
        return env;
      };
      return function applyReactionRule(cells, jp) {
        const reactedCells = cells.map(function reactCell(cell) {
          return cell.react(jp, cellCreation);
        });
        return cellLib.removeDuplicates(reactedCells.concat(cells));
      };
    },

    killCreators(rule) {
      return function killCreatorsRule(cells, jp) {
        const nextCells = rule(cells, jp);
        return cellLib.difference(nextCells, cellLib.creators(nextCells, cells));
      };
    },

    addSeed(pattern) {
      return function addSeedRule(rule) {
        return function addSeedInner(cells, jp) {
          const nextCells = rule(cells, jp);
          return nextCells.length === 0 || cellLib.onlyMatchCells(nextCells)
            ? nextCells.concat([cellLib.seed(pattern)])
            : nextCells;
        };
      };
    },

    keepSeed(pattern) {
      return function keepSeedRule(rule) {
        return function keepSeedInner(cells, jp) {
          const nextCells = rule(cells, jp);
          return cellLib.countSeed(nextCells) > 0 ? nextCells : nextCells.concat([cellLib.seed(pattern)]);
        };
      };
    },

    traceLifeTime(delta) {
      return function traceLifeTimeRule(rule) {
        return function traceLifeTimeInner(cells, jp) {
          const nextCells = rule(cells, jp);
          return nextCells.filter(function filterByTime(cell) {
            return Date.now() - cell.env.time <= delta;
          });
        };
      };
    },

    differentBindings(rule) {
      return function differentBindingsRule(cells, jp) {
        const nextCells = rule(cells, jp);
        const newCells = cellLib.difference(nextCells, cells);

        const filteredNewCells = newCells.filter(function filterNewCell(newCell) {
          if (newCell.creator && newCell.creator.tag > 1) {
            return true;
          }

          const sisterCells = cellLib.sisters(newCell, cells);
          return sisterCells.some(function sisterHasSameEnv(sisterCell) {
            return !newCell.creator.isSeed() && envLib.equal(newCell.env, sisterCell.env);
          });
        });

        return cellLib.difference(nextCells, filteredNewCells);
      };
    },

    tracematchApplyReaction(alphabet) {
      const creation = function creation(env) {
        return env;
      };

      return function tracematchRule(cells, jp) {
        const nextCells = [];

        for (let i = 0; i < cells.length; i += 1) {
          if (alphabet.some(function isInAlphabet(sym) {
            return resultLib.isEnv(sym(jp, cells[i].env));
          })) {
            const nextCell = cells[i].react(jp, creation);
            if (nextCell !== cells[i]) {
              nextCells.push(cells[i]);
              nextCells.push(nextCell);
              if (nextCell.isMatch() && envLib.equal(cells[i].env, nextCell.env)) {
                cells[i].tag = cells[i].tag ? cells[i].tag + 1 : 1;
              }
            }
          } else {
            nextCells.push(cells[i]);
          }
        }

        return nextCells;
      };
    },
  };

  const matching = ESA.matching = {
    multiple: rules.applyReaction(),

    oneAtATime(pattern) {
      return rules.addSeed(pattern)(rules.killCreators(rules.applyReaction()));
    },

    singleMatch: rules.killCreators(rules.applyReaction()),

    alwaysBeginAMatch(pattern) {
      return rules.keepSeed(pattern)(rules.killCreators(rules.applyReaction()));
    },

    timingToMatch(pattern, delta) {
      return rules.addSeed(pattern)(
        rules.traceLifeTime(delta)(
          rules.killCreators(
            rules.applyReaction(function createTimedEnv(env, seq, creator) {
              void seq;
              return creator.isSeed() ? env.bind("time", Date.now()) : creator.env;
            }),
          ),
        ),
      );
    },

    tracematch(pattern, alphabet) {
      return rules.keepSeed(pattern)(rules.differentBindings(rules.tracematchApplyReaction(alphabet)));
    },
  };

  const advising = ESA.advising = {
    single(matchCells, jp, advice) {
      return advice.call(this, jp, matchCells[0].env);
    },

    simultaneous(matchCells, jp, advice) {
      return matchCells.map(function eachMatch(matchCell) {
        return advice.call(this, jp, matchCell.env);
      }).pop();
    },

    differentBindings(matchCells, jp, advice) {
      function bindingWeight(env) {
        let weight = 0;
        for (const name in env) {
          if (SKIPPED_ENV_KEYS[name]) {
            continue;
          }
          const value = env[name];
          if (value instanceof Array) {
            weight += value.length + 1;
          } else if (value !== undefined) {
            weight += 1;
          }
        }
        return weight;
      }

      const ordered = matchCells.slice().sort(function bySpecificity(a, b) {
        return bindingWeight(b.env) - bindingWeight(a.env);
      });

      const filteredMatchCells = [];
      ordered.forEach(function eachMatch(matchCell) {
        if (!filteredMatchCells.some(function hasContained(filteredMatchCell) {
          return envLib.isContained(filteredMatchCell.env, matchCell.env);
        })) {
          filteredMatchCells.push(matchCell);
        }
      });
      return advising.simultaneous(filteredMatchCells, jp, advice);
    },
  };

  const envLib = ESA.envLib = {
    join(accEnv, newEnv) {
      if (!newEnv || newEnv === true) {
        return accEnv;
      }

      let joined = accEnv || emptyEnv;
      for (const name in newEnv) {
        if (SKIPPED_ENV_KEYS[name]) {
          continue;
        }

        if (joined[name] !== newEnv[name]) {
          if (newEnv[name] instanceof OwnArrayEnv) {
            for (let i = 0; i < newEnv[name].length; i += 1) {
              joined = joined.bind(name, newEnv[name][i]);
            }
          } else {
            joined = joined.bind(name, newEnv[name]);
          }
        }
      }
      return joined;
    },

    isContained(envContainer, containedEnv) {
      function valueContains(containerValue, containedValue) {
        if (containerValue === containedValue) {
          return true;
        }
        if (containerValue instanceof Array) {
          if (containedValue instanceof Array) {
            return containedValue.every(function eachValue(value) {
              return containerValue.indexOf(value) >= 0;
            });
          }
          return containerValue.indexOf(containedValue) >= 0;
        }
        return false;
      }

      for (const name in containedEnv) {
        if (SKIPPED_ENV_KEYS[name]) {
          continue;
        }
        if (!valueContains(envContainer[name], containedEnv[name])) {
          return false;
        }
      }
      return true;
    },

    equal(env1, env2) {
      return this.isContained(env1, env2) && this.isContained(env2, env1);
    },

    resultsToJoinedEnv(result1, result2) {
      if (resultLib.isPair(result1) && resultLib.isPair(result2)) {
        return this.join(result1[1], result2[1]);
      }
      if (resultLib.isPair(result1)) {
        return result1[1];
      }
      return result2[1];
    },
  };

  const cellLib = ESA.cellLib = {
    seed(pattern) {
      return new Cell(pattern, emptyEnv, null);
    },

    removeDuplicates(array) {
      const newArray = [];
      for (let i = 0; i < array.length; i += 1) {
        let duplicated = false;
        for (let j = 0; j < newArray.length; j += 1) {
          if (array[i] === newArray[j]) {
            duplicated = true;
            break;
          }
        }

        if (!duplicated) {
          newArray.push(array[i]);
        }
      }
      return newArray;
    },

    onlyMatchCells(cells) {
      for (let i = 0; i < cells.length; i += 1) {
        if (!cells[i].isMatch()) {
          return false;
        }
      }
      return true;
    },

    matchCells(cells) {
      return cells.filter(function isMatchCell(cell) {
        return cell.isMatch();
      });
    },

    noMatchCells(cells) {
      return cells.filter(function isNoMatchCell(cell) {
        return !cell.isMatch();
      });
    },

    creators(nextCells, cells) {
      return cellLib.parents(cellLib.difference(nextCells, cells));
    },

    countSeed(cells) {
      return cells.filter(function isSeedCell(cell) {
        return cell.isSeed();
      }).length;
    },

    difference(cells1, cells2) {
      return cells1.filter(function onlyInFirst(cell1) {
        return !cells2.some(function existsInSecond(cell2) {
          return cell1 === cell2;
        });
      });
    },

    parents(cells) {
      return cells.map(function parentOf(cell) {
        return cell.creator === null ? cell : cell.creator;
      });
    },

    envs(cells) {
      return cells.map(function envOf(cell) {
        return cell.env;
      });
    },

    hasDifferentBindings(aCell, cells) {
      return !cells.some(function sameBinding(cell) {
        return aCell !== cell && envLib.equal(aCell.env, cell.env);
      });
    },

    removeSeeds(cells) {
      return cells.filter(function notSeed(cell) {
        return !cell.isSeed();
      });
    },

    children(cells, creator) {
      return cells.filter(function isChild(cell) {
        return cell.creator === creator;
      });
    },

    sisters(cell, cells) {
      return cells.filter(function isSister(aCell) {
        return aCell !== cell && aCell.creator === cell.creator;
      });
    },
  };

  const resultLib = ESA.resultLib = {
    isSeq(fun) {
      return fun instanceof Function;
    },

    isEnv,

    isPair(result) {
      return result instanceof Array && this.isSeq(result[0]) && this.isEnv(result[1]);
    },
  };

  const tracematchLib = ESA.tracematchLib = {
    restrictIdentifier(oldValue, value) {
      return !oldValue || oldValue === value;
    },

    chainAdvice(matchCells, kind, advice) {
      const envs = cellLib.envs(matchCells);

      return function chainAdviceImpl(jp) {
        if (envs.length === 0) {
          return kind === ESA.AROUND ? jp.proceed() : undefined;
        }

        const originalProceed = jp.proceed;

        function makeJPView(proceedFn) {
          const clone = {};
          for (const key in jp) {
            clone[key] = jp[key];
          }
          clone.proceed = proceedFn;
          return clone;
        }

        function invoke(index) {
          const hasNext = index + 1 < envs.length;
          const proceedFn = function chainedProceed() {
            if (hasNext) {
              return invoke(index + 1);
            }
            if (kind === ESA.AROUND) {
              return originalProceed();
            }
            return undefined;
          };

          const jpView = makeJPView(proceedFn);
          const result = advice(jpView, envs[index]);

          if (kind === ESA.BEFORE || kind === ESA.AFTER) {
            return proceedFn();
          }

          return result;
        }

        return invoke(0);
      };
    },

    deploy(statefulAspect, alphabet) {
      const pattern = patternOf(statefulAspect);
      statefulAspect.pattern = pattern;
      statefulAspect.matching = ESA.matching.tracematch(pattern, alphabet);
      statefulAspect.advising = ESA.advising.differentBindings;
      return ESA.deploy(statefulAspect);
    },
  };

  ESA.BEFORE = AspectScript.BEFORE;
  ESA.AROUND = AspectScript.AROUND;
  ESA.AFTER = AspectScript.AFTER;
  ESA.globalObject = AspectScript.globalObject;

  return ESA;
}

if (typeof globalThis !== "undefined") {
  globalThis.createESA = createESA;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    createESA,
  };
}
