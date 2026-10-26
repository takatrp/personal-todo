import { createHandler } from './handler.mjs';

// Local declaration keeps the app's TypeScript check independent of the Deno SDK.
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};
Deno.serve(createHandler({ env: (name: string) => Deno.env.get(name) }));
