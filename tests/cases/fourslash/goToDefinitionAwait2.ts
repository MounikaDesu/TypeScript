/// <reference path="fourslash.ts" />

//// [|/*start*/await|] Promise.resolve(0);

verify.goToDefinition("start", []);
