import { OperationError } from './operation-error'

/**
 * The materialized side-effect a CLI command should apply when an
 * operation fails: write `body` to `stream` and exit with `exitCode`.
 *
 * Returning the side-effect as data (rather than reaching into
 * `process.stderr` / `process.exit` directly) keeps the function
 * pure, testable, and easy to compose into commands that have their
 * own ink-driven render loop or json output mode.
 */
export interface CliErrorWrite {
  readonly stream: 'stderr'
  readonly body: string
  readonly exitCode: number
}

/**
 * Default exit code for a failed operation routed through the CLI.
 * Anything non-zero satisfies the contract; we pick `1` to match the
 * existing `apps/cli/src/commands/run-*.ts` convention.
 */
const DEFAULT_OPERATION_FAILURE_EXIT_CODE = 1

/**
 * Convert an `OperationError` into the bytes a CLI command should
 * emit. The body is `JSON.stringify(err.toJSON())` plus a single
 * trailing newline so stderr stays line-flushed for downstream
 * consumers (jq, MCP-bridge wrappers, structured log shippers).
 *
 * The body is BYTE-IDENTICAL to the `text` field of the MCP
 * `tools/call` error response built by `serializeOperationErrorForMcp`
 * — that byte equality is the contract slice #293 enforces.
 */
export function serializeOperationErrorForCli(err: OperationError): CliErrorWrite {
  return {
    stream: 'stderr',
    body: `${JSON.stringify(err.toJSON())}\n`,
    exitCode: DEFAULT_OPERATION_FAILURE_EXIT_CODE,
  }
}
