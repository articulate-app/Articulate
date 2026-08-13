import { NextResponse } from "next/server"
import { getLocalBrowserJwks } from "@/lib/browser-helper-auth"

export const dynamic = "force-dynamic"

/** Public JWKS / PEM for Browser Helper JWT verification. No secrets. */
export async function GET() {
  const jwks = await getLocalBrowserJwks()
  // Public JWK only — never include PEM/spki material in `keys`.
  const keys = jwks.keys.map((key) => {
    const { spki: _spki, ...rest } = key as Record<string, unknown>
    return rest
  })
  return NextResponse.json(
    {
      keys,
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
