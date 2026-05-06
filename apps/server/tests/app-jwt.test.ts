import { describe, expect, test } from 'bun:test'
import { createPublicKey, verify, KeyObject } from 'crypto'
import { mintAppJwt } from '../src/github/app-jwt'

// Test-only RSA key — generated for this unit test, never used against real GitHub.
const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDbyKGhTOlad9wf
OO/QHhFQgd/Im3gkzjw0iL/LKgdIlmCeLPXvYNxhxLfA6wMSsjIMIpyyFVvifKG8
vQIHx+X5Wr4bcjM/kTEbo3fMOPoRgipZu72sKPBRMNrNYOcqTG7M2T+Xyh78yGN5
Elb5ZMsdkkgGtaghYltuu1QIP/hYFU0eshKhoDoT7QtFfLGwf+7l6fkdpWuF6kNh
b+zGMXQ6vfqq2IIS6xxdvna2KhFs5tCOIxgB097c4xWI3YltxVBXGLooE9ltzfsR
Vw9b/stMwLR34sXqWqmXZaeH/tWJ4KHpxBfJNFB7Q2gAXuStJT0uoB5a0XJo8i3N
WmHq/EypAgMBAAECggEARCQ1MIxnARyOS8PcXlskJSDPICRLoKWsduE7DaNPNMsi
04e/DGOskEdsbUyv3DkRWT/V80S6A0N+5cR3/6+TdrcSn/HNP9UlM5uABfpYVdtU
hBO4H8tljtalz+1OXofqBmsI02fgKaF7bcso2hPNAbMbz7C8mvUiwfcke5ZRygTl
iEDsMXrveFnytv8+Da4Id+O48+MLf87KFyfjPyKpb/a3+TF6BkueZK93BA0nUbnV
tn9jkuYFXpWPhl76TfJG4/hRuT7zEeznlt9/Dp/hV4VjonBuF0qgrT4NYdxmb6ZU
17TcsFs+bXqSQnXk85zkVqDleDK6zzJoOf+OiU22rQKBgQD0cZH8jUXQ1jD/+8dm
+XGFp6GAaHo7fxs3sfFo3qBesd0Fr7NuWPveqFIyrDg8N1rzcLne1p/0A4KouHeF
0zkDFh7pnHeajMRJpjuVNHTUECGwYfWb6Dbun5yVodSqEl7tWh7KFuT8cS7XF4EX
G+gd+WkrkqY2LLQRmrdQBQ0CxwKBgQDmLJv+Ap/rsCQmMATuBl2+1F+EZFVQXsWM
GH6y/KVmL5Zb2nUNlLI9ioMpeTraLLmeMOm+ymWXj9MGS+aNul2svSY+Iyfgedoc
0MFeovj59ADvDCLaw40SRLGDsdsx+trJdmNrCXVUaIKcAk1MoooKKTEztB8NSs3s
RBOpLTrFDwKBgQDPHIr82RYWY+UQf1vsO92byPRlwCAQ2RlOj05j9H0cvsbuUnhN
PsfpV+SNWq4rFxvQt+pEjMTqEy9ZlTJwCQ99NfjrJs+P+0U0wcwqF1AFfcWNlPJt
LsucU1Bw17VAhGA56um7gLpzydJOHHQcCGEbRH9/k7mQnT/UyqoW+rCTcQKBgQCC
WkMhkGT2+jMOuWUhU9OlbeqGNLgoIvPniju+q9wTyeFyNX7S6SIkPhxX0YMl6exZ
DURjO4ZbViVhTHzOSPwiBqDw0cIUm42Ngh/ws4UjMS+SMaJPmC19ag/KEGCdpn5f
V7+n75xV6DYHmjoiq25XoMpviJOJWJLUOh2UUrwUuwKBgQDLW3GAzRl/EgqU1Oui
rVNTBTZKVaTr2JsAaJiV1NIhb/cYDv8tNnft6kiSHFLJEjAw3dxO9pIHLfO6dNqe
/4DoXenL44UyrHFWtRp4QkHBhT7iTZHRlMRzZccpBi3CYAtPhwsIdTc1Ogu/18SR
xNZKi7F8TfCErrGKllZfW/lQCQ==
-----END PRIVATE KEY-----`

function publicKeyFor(privateKeyPem: string): KeyObject {
  return createPublicKey({ key: privateKeyPem, format: 'pem' })
}

function verifyJwtRs256(jwt: string, publicKey: KeyObject): boolean {
  const [headerB64, payloadB64, signatureB64] = jwt.split('.')
  if (!headerB64 || !payloadB64 || !signatureB64) return false
  const signingInput = `${headerB64}.${payloadB64}`
  // base64url → base64
  const sig = Buffer.from(signatureB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  return verify('RSA-SHA256', Buffer.from(signingInput), publicKey, sig)
}

describe('mintAppJwt', () => {
  test('returns a three-part JWT signed with the App private key', async () => {
    const jwt = await mintAppJwt({ appId: 3617072, privateKey: TEST_PRIVATE_KEY })

    const parts = jwt.split('.')
    expect(parts.length).toBe(3)

    expect(verifyJwtRs256(jwt, publicKeyFor(TEST_PRIVATE_KEY))).toBe(true)
  })

  test('JWT payload sets iss to the App ID', async () => {
    const jwt = await mintAppJwt({ appId: 3617072, privateKey: TEST_PRIVATE_KEY })
    const payloadB64 = jwt.split('.')[1]
    const payload = JSON.parse(
      Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8'),
    )
    // GH App JWT — `iss` carries the App ID, `exp` ≤ 10 minutes from `iat`.
    expect(String(payload.iss)).toBe('3617072')
    expect(typeof payload.iat).toBe('number')
    expect(typeof payload.exp).toBe('number')
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(600)
  })
})
