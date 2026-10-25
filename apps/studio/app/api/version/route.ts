// Public build identity only. Never expose environment values or account metadata here.
declare const __BLACKBLEND_REVISION__: string;
declare const __BLACKBLEND_RUNTIME__: string;
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(
    {
      app: "blackblend-studio",
      revision: __BLACKBLEND_REVISION__,
      runtime: __BLACKBLEND_RUNTIME__,
    },
    {
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    },
  );
}
