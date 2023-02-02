//// [spreadTupleAccessedByTypeParameter.ts]
export function test<N extends number>(singletons: ["a"][], i: N) {
  const singleton = singletons[i];
  const [, ...rest] = singleton;

  return rest;
}


//// [spreadTupleAccessedByTypeParameter.js]
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.test = void 0;
function test(singletons, i) {
    var singleton = singletons[i];
    var rest = singleton.slice(1);
    return rest;
}
exports.test = test;
