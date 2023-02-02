//// [esDecorators-classDeclaration-accessors-nonStatic.ts]
declare let dec: any;

const method3 = "method3";

class C {
    @dec(11) get method1() { return 0; }
    @dec(12) set method1(value) {}
    @dec(21) get ["method2"]() { return 0; }
    @dec(22) set ["method2"](value) {}
    @dec(31) get [method3]() { return 0; }
    @dec(32) set [method3](value) {}
}


//// [esDecorators-classDeclaration-accessors-nonStatic.js]
const method3 = "method3";
let C = (() => {
    var _a, _b;
    let _instanceExtraInitializers = [];
    let _get_method1_decorators;
    let _set_method1_decorators;
    let _get_member_decorators;
    let _set_member_decorators;
    let _get_member_decorators_1;
    let _set_member_decorators_1;
    return class C {
        static {
            __esDecorate(this, null, _get_method1_decorators, { kind: "getter", name: "method1", static: false, private: false }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _set_method1_decorators, { kind: "setter", name: "method1", static: false, private: false }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _get_member_decorators, { kind: "getter", name: "method2", static: false, private: false }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _set_member_decorators, { kind: "setter", name: "method2", static: false, private: false }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _get_member_decorators_1, { kind: "getter", name: _a, static: false, private: false }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _set_member_decorators_1, { kind: "setter", name: _b, static: false, private: false }, null, _instanceExtraInitializers);
        }
        get method1() { return 0; }
        set method1(value) { }
        get ["method2"]() { return 0; }
        set ["method2"](value) { }
        get [(_get_method1_decorators = [dec(11)], _set_method1_decorators = [dec(12)], _get_member_decorators = [dec(21)], _set_member_decorators = [dec(22)], _get_member_decorators_1 = [dec(31)], _a = __propKey(method3))]() { return 0; }
        set [(_set_member_decorators_1 = [dec(32)], _b = __propKey(method3))](value) { }
        constructor() {
            __runInitializers(this, _instanceExtraInitializers);
        }
    };
})();
