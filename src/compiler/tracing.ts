import * as ts from "./_namespaces/ts";

/* Tracing events for the compiler. */

// eslint-disable-line local/one-namespace-per-file
// should be used as tracing?.___
/** @internal */
export let tracing: typeof tracingEnabled | undefined;
// enable the above using startTracing()

// `tracingEnabled` should never be used directly, only through the above
namespace tracingEnabled { // eslint-disable-line local/one-namespace-per-file
    type Mode = "project" | "build" | "server";

    let fs: typeof import("fs");

    let traceCount = 0;
    let traceFd = 0;

    let mode: Mode;

    const typeCatalog: ts.Type[] = []; // NB: id is index + 1

    let legendPath: string | undefined;
    const legend: TraceRecord[] = [];

    // The actual constraint is that JSON.stringify be able to serialize it without throwing.
    interface Args {
        [key: string]: string | number | boolean | null | undefined | Args | readonly (string | number | boolean | null | undefined | Args)[];
    }

    /** Starts tracing for the given project. */
    export function startTracing(tracingMode: Mode, traceDir: string, configFilePath?: string) {
        ts.Debug.assert(!tracing, "Tracing already started");

        if (fs === undefined) {
            try {
                fs = require("fs");
            }
            catch (e) {
                throw new Error(`tracing requires having fs\n(original error: ${e.message || e})`);
            }
        }

        mode = tracingMode;
        typeCatalog.length = 0;

        if (legendPath === undefined) {
            legendPath = ts.combinePaths(traceDir, "legend.json");
        }

        // Note that writing will fail later on if it exists and is not a directory
        if (!fs.existsSync(traceDir)) {
            fs.mkdirSync(traceDir, { recursive: true });
        }

        const countPart =
            mode === "build" ? `.${process.pid}-${++traceCount}`
            : mode === "server" ? `.${process.pid}`
            : ``;
        const tracePath = ts.combinePaths(traceDir, `trace${countPart}.json`);
        const typesPath = ts.combinePaths(traceDir, `types${countPart}.json`);

        legend.push({
            configFilePath,
            tracePath,
            typesPath,
        });

        traceFd = fs.openSync(tracePath, "w");
        tracing = tracingEnabled; // only when traceFd is properly set

        // Start with a prefix that contains some metadata that the devtools profiler expects (also avoids a warning on import)
        const meta = { cat: "__metadata", ph: "M", ts: 1000 * ts.timestamp(), pid: 1, tid: 1 };
        fs.writeSync(traceFd,
            "[\n"
            + [{ name: "process_name", args: { name: "tsc" }, ...meta },
               { name: "thread_name", args: { name: "Main" }, ...meta },
               { name: "TracingStartedInBrowser", ...meta, cat: "disabled-by-default-devtools.timeline" }]
                .map(v => JSON.stringify(v)).join(",\n"));
    }

    /** Stops tracing for the in-progress project and dumps the type catalog. */
    export function stopTracing() {
        ts.Debug.assert(tracing, "Tracing is not in progress");
        ts.Debug.assert(!!typeCatalog.length === (mode !== "server")); // Have a type catalog iff not in server mode

        fs.writeSync(traceFd, `\n]\n`);
        fs.closeSync(traceFd);
        tracing = undefined;

        if (typeCatalog.length) {
            dumpTypes(typeCatalog);
        }
        else {
            // We pre-computed this path for convenience, but clear it
            // now that the file won't be created.
            legend[legend.length - 1].typesPath = undefined;
        }
    }

    export function recordType(type: ts.Type): void {
        if (mode !== "server") {
            typeCatalog.push(type);
        }
    }

    export const enum Phase {
        Parse = "parse",
        Program = "program",
        Bind = "bind",
        Check = "check", // Before we get into checking types (e.g. checkSourceFile)
        CheckTypes = "checkTypes",
        Emit = "emit",
        Session = "session",
    }

    export function instant(phase: Phase, name: string, args?: Args) {
        writeEvent("I", phase, name, args, `"s":"g"`);
    }

    const eventStack: { phase: Phase, name: string, args?: Args, time: number, separateBeginAndEnd: boolean }[] = [];

    /**
     * @param separateBeginAndEnd - used for special cases where we need the trace point even if the event
     * never terminates (typically for reducing a scenario too big to trace to one that can be completed).
     * In the future we might implement an exit handler to dump unfinished events which would deprecate
     * these operations.
     */
    export function push(phase: Phase, name: string, args?: Args, separateBeginAndEnd = false) {
        if (separateBeginAndEnd) {
            writeEvent("B", phase, name, args);
        }
        eventStack.push({ phase, name, args, time: 1000 * ts.timestamp(), separateBeginAndEnd });
    }
    export function pop(results?: Args) {
        ts.Debug.assert(eventStack.length > 0);
        writeStackEvent(eventStack.length - 1, 1000 * ts.timestamp(), results);
        eventStack.length--;
    }
    export function popAll() {
        const endTime = 1000 * ts.timestamp();
        for (let i = eventStack.length - 1; i >= 0; i--) {
            writeStackEvent(i, endTime);
        }
        eventStack.length = 0;
    }
    // sample every 10ms
    const sampleInterval = 1000 * 10;
    function writeStackEvent(index: number, endTime: number, results?: Args) {
        const { phase, name, args, time, separateBeginAndEnd } = eventStack[index];
        if (separateBeginAndEnd) {
            ts.Debug.assert(!results, "`results` are not supported for events with `separateBeginAndEnd`");
            writeEvent("E", phase, name, args, /*extras*/ undefined, endTime);
        }
        // test if [time,endTime) straddles a sampling point
        else if (sampleInterval - (time % sampleInterval) <= endTime - time) {
            writeEvent("X", phase, name, { ...args, results }, `"dur":${endTime - time}`, time);
        }
    }

    function writeEvent(eventType: string, phase: Phase, name: string, args: Args | undefined, extras?: string,
                        time: number = 1000 * ts.timestamp()) {

        // In server mode, there's no easy way to dump type information, so we drop events that would require it.
        if (mode === "server" && phase === Phase.CheckTypes) return;

        ts.performance.mark("beginTracing");
        fs.writeSync(traceFd, `,\n{"pid":1,"tid":1,"ph":"${eventType}","cat":"${phase}","ts":${time},"name":"${name}"`);
        if (extras) fs.writeSync(traceFd, `,${extras}`);
        if (args) fs.writeSync(traceFd, `,"args":${JSON.stringify(args)}`);
        fs.writeSync(traceFd, `}`);
        ts.performance.mark("endTracing");
        ts.performance.measure("Tracing", "beginTracing", "endTracing");
    }

    function getLocation(node: ts.Node | undefined) {
        const file = ts.getSourceFileOfNode(node);
        return !file
            ? undefined
            : {
                path: file.path,
                start: indexFromOne(ts.getLineAndCharacterOfPosition(file, node!.pos)),
                end: indexFromOne(ts.getLineAndCharacterOfPosition(file, node!.end)),
            };

        function indexFromOne(lc: ts.LineAndCharacter): ts.LineAndCharacter {
            return {
                line: lc.line + 1,
                character: lc.character + 1,
            };
        }
    }

    function dumpTypes(types: readonly ts.Type[]) {
        ts.performance.mark("beginDumpTypes");

        const typesPath = legend[legend.length - 1].typesPath!;
        const typesFd = fs.openSync(typesPath, "w");

        const recursionIdentityMap = new ts.Map<object, number>();

        // Cleverness: no line break here so that the type ID will match the line number
        fs.writeSync(typesFd, "[");

        const numTypes = types.length;
        for (let i = 0; i < numTypes; i++) {
            const type = types[i];
            const objectFlags = (type as any).objectFlags;
            const symbol = type.aliasSymbol ?? type.symbol;

            // It's slow to compute the display text, so skip it unless it's really valuable (or cheap)
            let display: string | undefined;
            if ((objectFlags & ts.ObjectFlags.Anonymous) | (type.flags & ts.TypeFlags.Literal)) {
                try {
                    display = type.checker?.typeToString(type);
                }
                catch {
                    display = undefined;
                }
            }

            let indexedAccessProperties: object = {};
            if (type.flags & ts.TypeFlags.IndexedAccess) {
                const indexedAccessType = type as ts.IndexedAccessType;
                indexedAccessProperties = {
                    indexedAccessObjectType: indexedAccessType.objectType?.id,
                    indexedAccessIndexType: indexedAccessType.indexType?.id,
                };
            }

            let referenceProperties: object = {};
            if (objectFlags & ts.ObjectFlags.Reference) {
                const referenceType = type as ts.TypeReference;
                referenceProperties = {
                    instantiatedType: referenceType.target?.id,
                    typeArguments: referenceType.resolvedTypeArguments?.map(t => t.id),
                    referenceLocation: getLocation(referenceType.node),
                };
            }

            let conditionalProperties: object = {};
            if (type.flags & ts.TypeFlags.Conditional) {
                const conditionalType = type as ts.ConditionalType;
                conditionalProperties = {
                    conditionalCheckType: conditionalType.checkType?.id,
                    conditionalExtendsType: conditionalType.extendsType?.id,
                    conditionalTrueType: conditionalType.resolvedTrueType?.id ?? -1,
                    conditionalFalseType: conditionalType.resolvedFalseType?.id ?? -1,
                };
            }

            let substitutionProperties: object = {};
            if (type.flags & ts.TypeFlags.Substitution) {
                const substitutionType = type as ts.SubstitutionType;
                substitutionProperties = {
                    substitutionBaseType: substitutionType.baseType?.id,
                    constraintType: substitutionType.constraint?.id,
                };
            }

            let reverseMappedProperties: object = {};
            if (objectFlags & ts.ObjectFlags.ReverseMapped) {
                const reverseMappedType = type as ts.ReverseMappedType;
                reverseMappedProperties = {
                    reverseMappedSourceType: reverseMappedType.source?.id,
                    reverseMappedMappedType: reverseMappedType.mappedType?.id,
                    reverseMappedConstraintType: reverseMappedType.constraintType?.id,
                };
            }

            let evolvingArrayProperties: object = {};
            if (objectFlags & ts.ObjectFlags.EvolvingArray) {
                const evolvingArrayType = type as ts.EvolvingArrayType;
                evolvingArrayProperties = {
                    evolvingArrayElementType: evolvingArrayType.elementType.id,
                    evolvingArrayFinalType: evolvingArrayType.finalArrayType?.id,
                };
            }

            // We can't print out an arbitrary object, so just assign each one a unique number.
            // Don't call it an "id" so people don't treat it as a type id.
            let recursionToken: number | undefined;
            const recursionIdentity = type.checker.getRecursionIdentity(type);
            if (recursionIdentity) {
                recursionToken = recursionIdentityMap.get(recursionIdentity);
                if (!recursionToken) {
                    recursionToken = recursionIdentityMap.size;
                    recursionIdentityMap.set(recursionIdentity, recursionToken);
                }
            }

            const descriptor = {
                id: type.id,
                intrinsicName: (type as any).intrinsicName,
                symbolName: symbol?.escapedName && ts.unescapeLeadingUnderscores(symbol.escapedName),
                recursionId: recursionToken,
                isTuple: objectFlags & ts.ObjectFlags.Tuple ? true : undefined,
                unionTypes: (type.flags & ts.TypeFlags.Union) ? (type as ts.UnionType).types?.map(t => t.id) : undefined,
                intersectionTypes: (type.flags & ts.TypeFlags.Intersection) ? (type as ts.IntersectionType).types.map(t => t.id) : undefined,
                aliasTypeArguments: type.aliasTypeArguments?.map(t => t.id),
                keyofType: (type.flags & ts.TypeFlags.Index) ? (type as ts.IndexType).type?.id : undefined,
                ...indexedAccessProperties,
                ...referenceProperties,
                ...conditionalProperties,
                ...substitutionProperties,
                ...reverseMappedProperties,
                ...evolvingArrayProperties,
                destructuringPattern: getLocation(type.pattern),
                firstDeclaration: getLocation(symbol?.declarations?.[0]),
                flags: ts.Debug.formatTypeFlags(type.flags).split("|"),
                display,
            };

            fs.writeSync(typesFd, JSON.stringify(descriptor));
            if (i < numTypes - 1) {
                fs.writeSync(typesFd, ",\n");
            }
        }

        fs.writeSync(typesFd, "]\n");

        fs.closeSync(typesFd);

        ts.performance.mark("endDumpTypes");
        ts.performance.measure("Dump types", "beginDumpTypes", "endDumpTypes");
    }

    export function dumpLegend() {
        if (!legendPath) {
            return;
        }

        fs.writeFileSync(legendPath, JSON.stringify(legend));
    }

    interface TraceRecord {
        configFilePath?: string;
        tracePath: string;
        typesPath?: string;
    }
}

// define after tracingEnabled is initialized
/** @internal */
export const startTracing = tracingEnabled.startTracing;
/** @internal */
export const dumpTracingLegend = tracingEnabled.dumpLegend;

/** @internal */
export interface TracingNode {
    tracingPath?: ts.Path;
}
