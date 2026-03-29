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

TestSuite.run();
