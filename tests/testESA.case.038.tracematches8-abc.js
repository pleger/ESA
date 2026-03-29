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

TestSuite.run();
