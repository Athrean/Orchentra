// Some gateways route and cache by a caller-supplied conversation id. It is an
// opaque routing token, never an identity: a fresh random value per provider
// instance keeps a conversation's turns on one route without carrying anything
// about the user or the machine.
export function newSessionId(): string {
  return `ses_${crypto.randomUUID().replace(/-/g, '')}`
}
