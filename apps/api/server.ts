import { Layer } from "effect";
import { HttpRouter } from "effect/http";
import { routes, services } from "./src/http";

// Nitro's server entry: every request goes to the Effect app, on Vercel and in `nitro dev`.
const { handler } = HttpRouter.toWebHandler(routes.pipe(Layer.provide(services)));

export default { fetch: (request: Request) => handler(request) };
