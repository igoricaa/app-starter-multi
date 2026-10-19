import { Effect } from "effect";
import * as Auth from "../src/auth";

await Effect.runPromise(Auth.seed.pipe(Effect.provide(Auth.layer)));
