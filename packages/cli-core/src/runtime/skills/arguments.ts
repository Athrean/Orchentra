const ESCAPED_DOLLAR = '\x01ORCHENTRA_DOLLAR\x01'

export function substituteSkillArguments(body: string, args: string[]): string {
  let working = body.split('\\$').join(ESCAPED_DOLLAR)

  working = working.split('$ARGUMENTS').join(args.join(' '))
  working = working.replace(/\$([0-9])/g, (_match: string, digit: string) => {
    const idx = Number.parseInt(digit, 10)
    return args[idx] ?? ''
  })

  return working.split(ESCAPED_DOLLAR).join('$')
}
