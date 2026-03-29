load("loader.js");

var ESA = AspectScript.ESA;
var PTs = ESA.Pointcuts;

var TestSuite = {
    tests: [],
    add: function (name, fun){
        if (arguments.length === 1){
            fun = name;
            name = "NO NAME";
        }
        this.tests.push([name, fun]);
    },
    run: function (filter){
        filter = filter || TestSuite.filters.description("all");
        var selected = this.tests.filter(filter);
        for (var i = 0; i < selected.length; ++i){
            try{
                selected[i][1]();
            }
            catch (error){
                if (error && typeof error === "object" && typeof error.message === "string"){
                    error.message = "ESA test failed [" + selected[i][0] + "]: " + error.message;
                    throw error;
                }
                throw new Error("ESA test failed [" + selected[i][0] + "]: " + error);
            }
        }
    }
};

TestSuite.filters = {
    names: function (){
        var names = arguments;
        return function (element){
            for (var i = 0; i < names.length; ++i){
                if (names[i][names[i].length - 1] === "*"){
                    if (element[0].substr(0, names[i].length - 1) === names[i].substr(0, names[i].length - 1)){
                        return true;
                    }
                }
                else if (element[0] === names[i]){
                    return true;
                }
            }
            return false;
        };
    },
    numbers: function (order){
        order = order.split(",");
        return function (element, index){
            void element;
            for (var i = 0; i < order.length; ++i){
                if (index == order[i]){
                    return true;
                }
            }
            return false;
        };
    },
    description: function (location){
        return function (element, index, array){
            void element;
            switch (location){
                case "first":
                    return index === 0;
                case "last":
                    return index === array.length - 1;
                case "all":
                default:
                    return true;
            }
        };
    }
};

var a = function (){
    Testing.flag("a");
};
var b = function (){
    Testing.flag("b");
};
var c = function (){
    Testing.flag("c");
};
var d = function (){
    Testing.flag("d");
};

var x = function (){
    Testing.flag("x");
};

TestSuite.add("A", function (){

    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.call(a),
        advice:function (){
            Testing.flag("match!");
        }
    };

    var handlerSAsp = ESA.deploy(statefulAspect);

    a();
    ESA.undeploy(handlerSAsp);

    return Testing.check("match!", "a");
});
TestSuite.add("A-env", function (){
    var callA = PTs.call(a).and(function (jp, env){
        return env.bind("value", jp.args[0]);
    });

    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:callA,
        advice:function (jp, env){
            Testing.flag("match!:" + env.value);
        }
    };

    var handlerSAsp = ESA.deploy(statefulAspect);

    a(1);
    ESA.undeploy(handlerSAsp);

    return Testing.check("match!:1", "a");
});

TestSuite.add("seqAB", function (){

    var statefulAspect = {
        kind:ESA.AFTER,
        pattern:PTs.seq(PTs.call(a), PTs.call(b)),
        advice:function (){
            Testing.flag("ab");
        }
    };

    var handlerSAsp = ESA.deploy(statefulAspect);

    a();
    b();
    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "b", "ab");
});
TestSuite.add("SeqABC", function (){
    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.seq(PTs.call(a), PTs.seq(PTs.call(b), PTs.call(c))),
        advice:function (){
            Testing.flag("abc");
        }
    };

    var handlerSAsp = ESA.deploy(statefulAspect);

    a();
    b();
    c();

    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "b", "abc", "c");
});
TestSuite.add("SeqN", function (){
    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.seqN(PTs.call(a), PTs.call(b), PTs.call(c)),
        advice:function (){
            Testing.flag("abc");
        }
    };

    var handlerSAsp = ESA.deploy(statefulAspect);

    a();
    b();
    c();
    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "b", "abc", "c");
});

TestSuite.add("OrAB1", function (){
    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.or(PTs.call(a), PTs.call(b)),
        advice:function (){
            Testing.flag("or");
        }
    };

    var handlerSAsp = ESA.deploy(statefulAspect);

    a();
    b();
    ESA.undeploy(handlerSAsp);

    return Testing.check("or", "a", "or", "b");
});
TestSuite.add("OrAB2", function (){
    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.or(PTs.call(a), PTs.call(b)),
        advice:function (){
            Testing.flag("or");
        }
    };


    var handlerSAsp = ESA.deploy(statefulAspect);

    b();
    ESA.undeploy(handlerSAsp);

    return Testing.check("or", "b");
});
TestSuite.add("Or-seq1", function (){
    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.or(PTs.seq(PTs.call(a), PTs.call(b)), PTs.seq(PTs.call(x), PTs.call(c))),
        advice:function (){
            Testing.flag("or-seq");
        }
    };

    var handlerSAsp = ESA.deploy(statefulAspect);

    a();
    b();
    c();
    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "or-seq", "b", "c");
});
TestSuite.add("Or-seq2", function (){
    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.or(PTs.seq(PTs.call(a), PTs.call(b)), PTs.seq(PTs.call(x), PTs.call(c))),
        advice:function (){
            Testing.flag("or-seq");
        }
    };

    var handlerSAsp = ESA.deploy(statefulAspect);

    a();
    b();
    c();
    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "or-seq", "b", "c");
});
TestSuite.add("Or-seq3", function (){
    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.or(PTs.seq(PTs.call(a), PTs.call(b)), PTs.seq(PTs.call(a), PTs.call(c))),
        advice:function (){
            Testing.flag("or-seq");
        }
    };

    var handlerSAsp = ESA.deploy(statefulAspect);

    a();
    b();
    c();
    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "or-seq", "b", "c");
});
TestSuite.add("Or-seq4-multiple", function (){
    //(ab | ac)
    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.or(PTs.seq(PTs.call(a), PTs.call(b)), PTs.seq(PTs.call(a), PTs.call(c))),
        advice:function (){
            Testing.flag("or-seq");
        },
        matching:ESA.matching.multiple,
        advising:ESA.advising.simultaneous
    };

    var handlerSAsp = ESA.deploy(statefulAspect);

    a();
    b();
    c();
    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "or-seq", "b", "or-seq", "c");
});
TestSuite.add("seq-or-seq", function (){
    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.seq(PTs.or(PTs.seq(PTs.call(a), PTs.call(b)), PTs.seq(PTs.call(a), PTs.call(c))), PTs.call(d)),
        advice:function (){
            Testing.flag("seq-or-seq");
        }
    };

    var handlerSAsp = ESA.deploy(statefulAspect);

    a();
    b();
    d();
    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "b", "seq-or-seq", "d");
});

TestSuite.add("anyorder1", function (){
    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.anyOrder([PTs.call(a), PTs.call(b), PTs.call(c)]),
        advice:function (){
            Testing.flag("anyorder");
        }
    };

    var handlerSAsp = ESA.deploy(statefulAspect);

    c();
    b();
    a();
    ESA.undeploy(handlerSAsp);

    return Testing.check("c", "b", "anyorder", "a");
});
TestSuite.add("anyorder2", function (){
    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.anyOrder([PTs.call(a), PTs.seq(PTs.call(b), PTs.call(c)), PTs.call(d)]),
        advice:function (){
            Testing.flag("anyorder");
        }
    };

    var handlerSAsp = ESA.deploy(statefulAspect);

    d();
    b();
    a();
    c();
    ESA.undeploy(handlerSAsp);

    return Testing.check("d", "b", "a", "anyorder", "c");
});

TestSuite.add("multiple1", function (){
    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.seq(PTs.call(a), PTs.seq(PTs.call(b), PTs.call(c))),
        advice:function (){
            Testing.flag("multiple");
        },
        matching:ESA.matching.multiple,
        advising:ESA.advising.simultaneous
    };

    var handlerSAsp = ESA.deploy(statefulAspect);

    a();
    b();
    b();
    c();

    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "b", "b", "multiple", "multiple", "c");
});
TestSuite.add("multiple2", function (){
    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.seq(PTs.call(a), PTs.seq(PTs.call(b), PTs.call(c))),
        advice:function (){
            Testing.flag("single");
        }
    };

    var handlerSAsp = ESA.deploy(statefulAspect);

    a();
    b();
    b();
    c();
    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "b", "b", "single", "c");
});

TestSuite.add("REINIT", function (){
    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.or(PTs.call(a), PTs.call(b)),
        advice:function (){
            Testing.flag("or-reinit");
        }
    };

    var handlerSAsp = ESA.deploy(statefulAspect);

    a();
    b();
    ESA.undeploy(handlerSAsp);

    return Testing.check("or-reinit", "a", "or-reinit", "b");
});
TestSuite.add("repeatUntil", function (){
    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.repeatUntil(PTs.call(a), PTs.call(b)),
        advice:function (){
            Testing.flag("repeat-until");
        }
    };

    var handlerSAsp = ESA.deploy(statefulAspect);

    a();
    a();
    b();
    a();
    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "a", "repeat-until", "b", "a");
});

TestSuite.add("repealUntilselAB-env1", function (){
    var callA = PTs.call(a).and(function (jp, env){
        return env.bind("value", jp.args[0]);
    });

    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.repeatUntil(callA, PTs.call(b)),
        advice:function (jp, env){
            Testing.flag("repeat-until:" + env.value.join(","));
        }
    };

    var handlerSAsp = ESA.deploy(statefulAspect);

    a(1);
    a(2);
    b();
    a(3);
    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "a", "repeat-until:1,2", "b", "a");
});
TestSuite.add("repealUntilselAB-env2", function (){
    var callA = PTs.call(a).and(function (event, env){
        return env.bind("val1", event.args[0]).bind("val2", event.args[0] + 1);
    });

    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.repeatUntil(callA, PTs.call(b)),
        advice:function (jp, env){
            var vals1 = env.val1;
            var vals2 = env.val2;
            Testing.flag("repeat-until vals1:" + vals1.join(",") + " vals2:" + vals2.join(","));
        }
    };


    var handlerSAsp = ESA.deploy(statefulAspect);

    a(1);
    a(2);
    b();
    a(3);
    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "a", "repeat-until vals1:1,2 vals2:2,3", "b", "a");
});
TestSuite.add("repealUntilselAB-env3", function (){
    var callA = PTs.call(a).and(function (jp, env){
        return env.bind("value", jp.args[0]);
    });

    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.repeatUntil(callA, PTs.call(b)),
        advice:function (jp, env){
            var sum = env.value.reduce(function (a, b){
                return a + b;
            });
            Testing.flag("repeat-until:" + sum);
        }
    };

    var handlerSAsp = ESA.deploy(statefulAspect);

    a(1);
    a(2);
    a(3);
    b();
    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "a", "a", "repeat-until:6", "b");
});


TestSuite.add("repealUntilAB-C", function (){
    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.repeatUntil(PTs.seq(PTs.call(a), PTs.call(b)), PTs.call(c)),
        advice:function (){
            Testing.flag("repeat-until");
        }
    };


    var handlerSAsp = ESA.deploy(statefulAspect);
    a();
    b();
    a();
    b();
    c();
    a();
    b();

    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "b", "a", "b", "repeat-until", "c", "a", "b");
});
TestSuite.add("repealUntilCOMPLEJO", function (){
    // ab || ac
    var seqExpRepeat = PTs.or(PTs.seq(PTs.call(a), PTs.call(b)), PTs.seq(PTs.call(a), PTs.call(c)));
    // (ab || ac)d
    var seqExpUntil = PTs.seq(seqExpRepeat, PTs.call(d));

    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.repeatUntil(seqExpRepeat, seqExpUntil),
        advice:function (){
            Testing.flag("repeat-until");
        }
    };

    var handlerSAsp = ESA.deploy(statefulAspect);

    a();
    b();
    a();
    c();
    d();
    a();
    b();
    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "b", "a", "c", "repeat-until", "d", "a", "b");
});
TestSuite.add("advScheduler:ONLY_DIFFERENT_INFO", function (){
    var callB = PTs.call(b).and(function (jp, env){
        return env.bind("value", jp.args[0]);
    });

    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.seqN(PTs.call(a), callB, PTs.call(c)),
        advice:function (jp, env){
            Testing.flag("matchABC:" + env.value);
        },
        matching:ESA.matching.multiple,
        advising:ESA.advising.differentBindings
    };

    var handlerSAsp = ESA.deploy(statefulAspect);

    a();
    b(1);
    b(2);
    b(1);
    c();
    ESA.undeploy(handlerSAsp);

    //first of children and later the pattern
    return Testing.check("a", "b", "b", "b", "matchABC:1", "matchABC:2", "c");
});

TestSuite.add("Tracematches0-abc", function (){

    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.seqN(PTs.call(a), PTs.call(b), PTs.call(c)),
        advice:function (){
            Testing.flag("tracematch");
        }
    };

    var handlerSAsp = ESA.tracematchLib.deploy(statefulAspect, [PTs.call(a), PTs.call(b), PTs.call(c)]);

    a();
    b();
    c();

    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "b", "tracematch", "c");
});
TestSuite.add("Tracematches0-Env-abc", function (){

    var callB = PTs.call(b).and(function (jp, env){
        return env.bind("value", jp.args[0]);
    });

    var symCallB = PTs.call(b).and(function (jp, env){
        return ESA.tracematchLib.restrictIdentifier(env.value, jp.args[0]);
    });

    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.seqN(PTs.call(a), callB, PTs.call(c)),
        advice:function (jp, env){
            Testing.flag("tracematch:" + env.value);
        }
    };

    var handlerSAsp = ESA.tracematchLib.deploy(statefulAspect, [PTs.call(a), symCallB, PTs.call(c)]);

    a();
    b(3);
    c();

    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "b", "tracematch:3", "c");
});
TestSuite.add("Tracematches1-abc", function (){

    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.seqN(PTs.call(a), PTs.call(b), PTs.call(c)),
        advice:function (){
            Testing.flag("tracematch");
        }
    };

    var handlerSAsp = ESA.tracematchLib.deploy(statefulAspect, [PTs.call(a), PTs.call(b), PTs.call(c)]);

    a();
    b();
    b();
    c();
    print("HOLA JAPON TAMPOCO XXXXXXXXXXXXXXXXX");

    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "b", "b", "c");
});
TestSuite.add("Tracematches2-abc", function (){

    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.seqN(PTs.call(a), PTs.call(b), PTs.call(c)),
        advice:function (){
            Testing.flag("tracematch");
        }
    };

    var handlerSAsp = ESA.tracematchLib.deploy(statefulAspect, [PTs.call(a), PTs.call(b), PTs.call(c)]);

    a();
    a();
    b();
    c();
    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "a", "b", "tracematch", "c");
});
TestSuite.add("Tracematches3-abc", function (){
    var callB = PTs.call(b).and(function (jp, env){
        return env.bind("value", jp.args[0]);
    });

    var symCallB = PTs.call(b).and(function (jp, env){
        return ESA.tracematchLib.restrictIdentifier(env.value, jp.args[0]);
    });

    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.seqN(PTs.call(a), callB, PTs.call(c)),
        advice:function (jp, env){
            Testing.flag("tracematch:" + env.value);
        }
    };

    var handlerSAsp = ESA.tracematchLib.deploy(statefulAspect, [PTs.call(a), symCallB, PTs.call(c)]);

    a();
    b(1);
    b(2);
    c();
    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "b", "b", "tracematch:2", "tracematch:1", "c");
});
TestSuite.add("Tracematches4-abc", function (){
    var callB = PTs.call(b).and(function (jp, env){
        return env.bind("value", 0);
    });

    var symCallB = PTs.call(b).and(function (jp, env){
        return ESA.tracematchLib.restrictIdentifier(env.value, 0);
    });

    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.seqN(PTs.call(a), callB, PTs.call(c)),
        advice:function (jp, env){
            Testing.flag("tracematch:" + env.value);
        }
    };

    var handlerSAsp = ESA.tracematchLib.deploy(statefulAspect, [PTs.call(a), symCallB, PTs.call(c)]);

    a();
    b();
    b();
    c();
    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "b", "b", "c");
});
TestSuite.add("Tracematches5-abc", function (){
    var callB = PTs.call(b).and(function (jp, env){
        return env.bind("value", jp.args[0]);
    });

    var symCallB = PTs.call(b).and(function (jp, env){
        return ESA.tracematchLib.restrictIdentifier(env.value, jp.args[0]);
    });

    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.seqN(PTs.call(a), callB, PTs.call(c)),
        advice:function (jp, env){
            Testing.flag("tracematch:" + env.value);
        }
    };

    var handlerSAsp = ESA.tracematchLib.deploy(statefulAspect, [PTs.call(a), symCallB, PTs.call(c)]);

    a();
    b(1);
    b(2);
    b(3);
    c();
    ESA.undeploy(handlerSAsp);

    //first of children and later the pattern
    return Testing.check("a", "b", "b", "b", "tracematch:3", "tracematch:2", "tracematch:1", "c");
});

//todo: verify
TestSuite.add("Tracematches6-abc", function (){
    var callB = PTs.call(b).and(function (jp, env){
        return env.bind("value", jp.args[0]);
    });

    var symCallB = PTs.call(b).and(function (jp, env){
        return ESA.tracematchLib.restrictIdentifier(env.value, jp.args[0]);
    });

    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.seqN(PTs.call(a), callB, PTs.call(c)),
        advice:function (jp, env){
            Testing.flag("tracematch:" + env.value);
        }
    };

    var handlerSAsp = ESA.tracematchLib.deploy(statefulAspect, [PTs.call(a), symCallB, PTs.call(c)]);

    a();
    b(1);
    b(2);
    b(1);
    c();
    ESA.undeploy(handlerSAsp);

    //first of children and later the pattern
    return Testing.check("a", "b", "b", "b", "tracematch:2", "c");
});
TestSuite.add("Tracematches6.1-abc", function (){
    var callB = PTs.call(b).and(function (jp, env){
        return env.bind("value", jp.args[0]);
    });

    var symCallB = PTs.call(b).and(function (jp, env){
        return ESA.tracematchLib.restrictIdentifier(env.value, jp.args[0]);
    });

    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.seqN(PTs.call(a), callB, PTs.call(c)),
        advice:function (jp, env){
            Testing.flag("tracematch:" + env.value);
        }
    };

    var handlerSAsp = ESA.tracematchLib.deploy(statefulAspect, [PTs.call(a), symCallB, PTs.call(c)]);

    a();
    b();
    b();
    c();
    ESA.undeploy(handlerSAsp);

    //first of children and later the pattern
    return Testing.check("a", "b", "b", "c");
});
TestSuite.add("TracematchesAB-abc", function (){
    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.seq(PTs.call(a), PTs.call(b)),
        advice:function (){
            Testing.flag("tracematch");
        }
    };

    var handlerSAsp = ESA.tracematchLib.deploy(statefulAspect, [PTs.call(a), PTs.call(b)]);

    a();
    a();
    b();

    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "a", "tracematch", "b");
});
TestSuite.add("TracematchesAB-Env-abc", function (){
    var callA = PTs.call(a).and(function (jp, env){
        return env.bind("value", jp.args[0]);
    });

    var symCallA = PTs.call(a).and(function (jp, env){
        return ESA.tracematchLib.restrictIdentifier(env.value, jp.args[0]);
    });

    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.seq(callA, PTs.call(b)),
        advice:function (jp, env){
            Testing.flag("tracematch:" + env.value);
        }
    };

    var handlerSAsp = ESA.tracematchLib.deploy(statefulAspect, [symCallA, PTs.call(b)]);

    a(1);
    a(2);
    b();

    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "a", "tracematch:2", "tracematch:1", "b");
});
TestSuite.add("TracematchesAB-SameEnv-abc", function (){
    var callA = PTs.call(a).and(function (jp, env){
        return env.bind("value", jp.args[0]);
    });

    var symCallA = PTs.call(a).and(function (jp, env){
        return ESA.tracematchLib.restrictIdentifier(env.value, jp.args[0]);
    });

    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.seq(callA, PTs.call(b)),
        advice:function (jp, env){
            Testing.flag("tracematch:" + env.value);
        }
    };

    var handlerSAsp = ESA.tracematchLib.deploy(statefulAspect, [symCallA, PTs.call(b)]);

    a(1);
    a(1);
    b();

    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "a", "tracematch:1", "b");
});


TestSuite.add("Tracematches7-abc", function (){

    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.seqN(PTs.call(a), PTs.call(a), PTs.call(a)),
        advice:function (){
            Testing.flag("tracematch");
        }
    };

    var handlerSAsp = ESA.tracematchLib.deploy(statefulAspect, [PTs.call(a), PTs.call(b)]);

    a();
    a();
    a();

    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "a", "tracematch", "a");
});
TestSuite.add("Tracematches8-abc", function (){

    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.seqN(PTs.call(a), PTs.call(a), PTs.call(a)),
        advice:function (){
            Testing.flag("tracematch");
        }
    };

    var handlerSAsp = ESA.tracematchLib.deploy(statefulAspect, [PTs.call(a), PTs.call(b)]);

    a();
    b();
    a();

    ESA.undeploy(handlerSAsp);

    //first of children and later the pattern
    return Testing.check("a", "b", "a");
});
TestSuite.add("Tracematches9-abc", function (){

    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.seqN(PTs.call(a), PTs.call(a), PTs.call(a)),
        advice:function (){
            Testing.flag("tracematch");
        }
    };

    var handlerSAsp = ESA.tracematchLib.deploy(statefulAspect, [PTs.call(a), PTs.call(b)]);

    a();
    a();
    a();
    a();


    ESA.undeploy(handlerSAsp);
    return Testing.check("a", "a", "tracematch", "a", "tracematch", "a");
});
TestSuite.add("Tracematches10-abc", function (){

    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.seqN(PTs.call(a), PTs.call(a), PTs.call(a)),
        advice:function (){
            Testing.flag("tracematch");
        }
    };

    var handlerSAsp = ESA.tracematchLib.deploy(statefulAspect, [PTs.call(a), PTs.call(b)]);

    a();
    b();
    a();
    a();

    ESA.undeploy(handlerSAsp);

    //first of children and later the pattern
    return Testing.check("a", "b", "a", "a");
});
TestSuite.add("Tracematches11-abc", function (){

    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.seqN(PTs.call(a), PTs.call(a), PTs.call(a)),
        advice:function (){
            Testing.flag("tracematch");
        }
    };

    var handlerSAsp = ESA.tracematchLib.deploy(statefulAspect, [PTs.call(a), PTs.call(b)]);

    a();
    a();
    a();

    b();

    a();
    a();
    a();

    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "a", "tracematch", "a", "b", "a", "a", "tracematch", "a");
});
TestSuite.add("Tracematches12-abc", function (){

    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.seqN(PTs.call(a), PTs.not(PTs.call(c))),
        advice:function (){
            Testing.flag("tracematch");
        }
    };

    var handlerSAsp = ESA.tracematchLib.deploy(statefulAspect, [PTs.call(a), PTs.call(b), PTs.call(c)]);

    a();
    b();

    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "tracematch", "b");
});
TestSuite.add("Tracematches13-abc", function (){

    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.seqN(PTs.call(a), PTs.not(PTs.call(c))),
        advice:function (){
            Testing.flag("tracematch");
        }
    };

    var handlerSAsp = ESA.tracematchLib.deploy(statefulAspect, [PTs.call(a), PTs.call(b), PTs.call(c)]);

    a();
    c();

    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "c");
});
TestSuite.add("Tracematches14-star-0-abc", function (){
    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.seq(PTs.call(d), PTs.starUntil(PTs.call(a), PTs.call(b))),
        advice:function (){
            Testing.flag("tracematch");
        }
    };

    var handlerSAsp = ESA.tracematchLib.deploy(statefulAspect, [PTs.call(d), PTs.call(a), PTs.call(b)]);

    d();
    a();
    a();
    a();
    b();

    ESA.undeploy(handlerSAsp);

    return Testing.check("d", "a", "a", "a", "tracematch", "b");
});
TestSuite.add("Tracematches14-star-1-abc", function (){
    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.starUntil(PTs.call(a), PTs.call(b)),
        advice:function (){
            Testing.flag("tracematch");
        }
    };

    var handlerSAsp = ESA.tracematchLib.deploy(statefulAspect, [PTs.call(a), PTs.call(b)]);

    a();
    a();
    a();
    b();

    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "a", "a", "tracematch", "b");
});
TestSuite.add("Tracematches14-star-2-abc", function (){
    var callA = PTs.call(a).and(function (jp, env){
        return env.bind("value", jp.args[0]);
    });

    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.starUntil(callA, PTs.call(b)),
        advice:function (jp, env){
            var values = env.value;
            values = values instanceof Array ? values : [values];

            var sum = values.reduce(function (a, b){
                return a + b;
            }, 0);

            Testing.flag("tracematch-sum:" + sum);
        }
        //spawn: SMs.spawn.SINGLE,???
    };

    var handlerSAsp = ESA.tracematchLib.deploy(statefulAspect, [PTs.call(a), PTs.call(b)]);

    a(1);
    a(5);
    a(10);
    b();

    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "a", "a", "tracematch-sum:16", "b");
});
TestSuite.add("Tracematches15", function (){


    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.seqN(PTs.call(a), PTs.call(d), PTs.call(b), PTs.call(c)),
        advice:function (){
            Testing.flag("tracematch");
        }
    };

    var handlerSAsp = ESA.tracematchLib.deploy(statefulAspect, [PTs.call(a), PTs.call(b), PTs.call(c), PTs.call(d)]);

    a();
    d();
    b();
    d();
    c();

    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "d", "b", "d", "c");
});


TestSuite.add("chainAspect-before", function (){

    var statefulAspect = {
        kind:ESA.BEFORE,
        pattern:PTs.seq(PTs.call(a), PTs.call(b)),
        advice:function (){
            Testing.flag("match");
        },
        matching:ESA.matching.multiple,
        advising:function (matchCells, jp, advice){
            advice = ESA.tracematchLib.chainAdvice(matchCells, ESA.BEFORE, advice);
            return advice(jp);
        }
    };

    var handlerSAsp = ESA.deploy(statefulAspect);

    a();
    a();
    a();
    b();

    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "a", "a", "match", "match", "match", "b");
});
TestSuite.add("chainAspect-after", function (){

    var statefulAspect = {
        kind:ESA.AFTER,
        pattern:PTs.seq(PTs.call(a), PTs.call(b)),
        advice:function (){
            Testing.flag("match");
        },
        matching:ESA.matching.multiple,
        advising:function (matchCells, jp, advice){
            advice = ESA.tracematchLib.chainAdvice(matchCells, ESA.AFTER, advice);
            return advice(jp);
        }
    };

    var handlerSAsp = ESA.deploy(statefulAspect);

    a();
    a();
    a();
    b();

    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "a", "a", "b", "match", "match", "match");
});

TestSuite.add("chainAspect-around1", function (){

    var statefulAspect = {
        kind:ESA.AROUND,
        pattern:PTs.seq(PTs.call(a), PTs.call(b)),
        advice:function (jp){
            Testing.flag("match");
            jp.proceed();
        },
        matching:ESA.matching.multiple,
        advising:function (matchCells, jp, advice){
            advice = ESA.tracematchLib.chainAdvice(matchCells, ESA.AROUND, advice);
            return advice(jp);
        }
    };

    var handlerSAsp = ESA.deploy(statefulAspect);

    a();
    a();
    a();
    b();

    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "a", "a", "match", "match", "match", "b");
});
TestSuite.add("chainAspect-around2", function (){

    var statefulAspect = {
        kind:ESA.AROUND,
        pattern:PTs.seq(PTs.call(a), PTs.call(b)),
        advice:function (jp){
            jp.proceed();
            Testing.flag("match");
        },
        matching:ESA.matching.multiple,
        advising:function (matchCells, jp, advice){
            advice = ESA.tracematchLib.chainAdvice(matchCells, ESA.AROUND, advice);
            return advice(jp);
        }
    };

    var handlerSAsp = ESA.deploy(statefulAspect);

    a();
    a();
    a();
    b();

    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "a", "a", "b", "match", "match", "match");
});
TestSuite.add("chainAspect-around3", function (){

    var statefulAspect = {
        kind:ESA.AROUND,
        pattern:PTs.seq(PTs.call(a), PTs.call(b)),
        advice:function (){
            Testing.flag("match");
        },
        matching:ESA.matching.multiple,
        advising:function (matchCells, jp, advice){
            advice = ESA.tracematchLib.chainAdvice(matchCells, ESA.AROUND, advice);
            return advice(jp);
        }
    };

    var handlerSAsp = ESA.deploy(statefulAspect);

    a();
    a();
    a();
    b();

    ESA.undeploy(handlerSAsp);

    return Testing.check("a", "a", "a", "match");
});

TestSuite.run();
//TestSuite.run(TestSuite.filters.numbers("0"));
//TestSuite.run(TestSuite.filters.names("Tracematches1-abc"));
//TestSuite.run(TestSuite.filters.names("Or-seq4-multiple"));
//TestSuite.run(TestSuite.filters.names("chain*"));
//TestSuite.run(TestSuite.filters.names("Tracematches14-star-abc"));
//TestSuite.run(TestSuite.filters.names("Tracematches*"));
