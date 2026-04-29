import type { Command } from "commander"
import chalk from "chalk"
import { Effect } from "effect"
import { doctorAction } from "../actions/doctor.js"
import { CliLive } from "../layers.js"
import { buildDoctorJsonPayload, renderDoctorPretty } from "./doctor-format.js"
import { COMMAND_DESCRIPTIONS, COMMON_OPTION_DESCRIPTIONS } from "./metadata.js"
export { buildDoctorJsonPayload } from "./doctor-format.js"
export { sanitizeDetail, sanitizeVersion } from "../util/sanitize.js"

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description(COMMAND_DESCRIPTIONS.doctor)
    .option("--all", "Check all known runtimes, not just those in schemas")
    .option("--ping", "Send a test prompt through each runtime to verify end-to-end")
    .option("--json", COMMON_OPTION_DESCRIPTIONS.json)
    .action(async (opts: { all?: boolean; ping?: boolean; json?: boolean }) => {
      const jsonOutput = opts.json ?? false
      const cols = process.stdout.columns ?? 80
      const isTTY = process.stdout.isTTY && !jsonOutput

      let spinnerInitialized = false
      let pingSpinnerInitialized = false

      const snapshot = await Effect.runPromise(
        doctorAction({
          includeAll: opts.all ?? false,
          includePing: opts.ping ?? false,
          onRuntimeProgress: isTTY
            ? (checked, total) => {
                if (!spinnerInitialized) {
                  process.stdout.write("\x1B[s")
                  spinnerInitialized = true
                }
                process.stdout.write(
                  `\x1B[u\x1B[0J  ${chalk.dim(`Checking runtimes... ${checked}/${total}`)}`,
                )
                if (checked === total) process.stdout.write("\x1B[u\x1B[0J")
              }
            : undefined,
          onPingProgress: isTTY
            ? (done, total) => {
                if (total === 0) return
                if (!pingSpinnerInitialized) {
                  process.stdout.write("\n\x1B[s")
                  pingSpinnerInitialized = true
                  process.stdout.write(`  ${chalk.dim(`Running ping tests... 0/${total}`)}`)
                } else {
                  process.stdout.write(
                    `\x1B[u\x1B[0J  ${chalk.dim(`Running ping tests... ${done}/${total}`)}`,
                  )
                  if (done === total) process.stdout.write("\x1B[u\x1B[0J")
                }
              }
            : undefined,
        }).pipe(Effect.provide(CliLive)),
      )

      if (jsonOutput) {
        const payload = buildDoctorJsonPayload({
          healthResults: snapshot.runtimes,
          runtimeUsage: snapshot.runtimeUsage,
          schemaReadiness: snapshot.schemaReadiness,
          projectChecks: snapshot.projectChecks,
          skillChecks: snapshot.skills,
          includePing: opts.ping ?? false,
          pingResults: snapshot.pingResults,
        })
        console.log(JSON.stringify(payload, null, 2))
        return
      }

      renderDoctorPretty(snapshot, cols)
    })
}
