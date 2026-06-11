import { NextRequest, NextResponse } from "next/server";
import { evaluateApiRequest } from "@/lib/request-origin-guard";

export function proxy(req: NextRequest) {
  const verdict = evaluateApiRequest({
    method: req.method,
    origin: req.headers.get("origin"),
    secFetchSite: req.headers.get("sec-fetch-site"),
    host: req.headers.get("host"),
  });

  if (!verdict.allowed) {
    return NextResponse.json(
      { error: verdict.reason ?? "Forbidden" },
      { status: 403 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
