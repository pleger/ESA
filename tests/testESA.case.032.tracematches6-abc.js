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

TestSuite.run();
