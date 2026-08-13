import { NextResponse } from "next/server"
import { getLocalBrowserJwks } from "@/lib/browser-helper-auth"

export const dynamic = "force-dynamic"

/** Public JWKS / PEM for Browser Helper JWT verification. No secrets. */
export async function GET() {
  const jwks = await getLocalBrowserJwks()
  return NextResponse.json(
    {
      keys: jwks.keys.map(({ spki: _spki, ...rest }) => rest),
      publicKeyPem: jwks.publicKeyPem,
      alg: "EdDSA",
      issuer: "articulate-local-browser",
      audience: "articulate-browser-helper",
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
      },
    },
  )
}
