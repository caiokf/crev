declare const CREV_VERSION: string
import { program } from "commander"
import { registerRunCommand } from "./commands/run.js"
import { registerListCommand } from "./commands/list.js"
import { registerShowCommand } from "./commands/show.js"
import { registerDiffCommand } from "./commands/diff.js"
import { registerDoctorCommand } from "./commands/doctor.js"
import { registerHelpCommand } from "./commands/help.js"
import { registerSchemaCommand } from "./commands/schema.js"
import { registerInitCommand } from "./commands/init.js"
import { registerUpdateCommand } from "./commands/update.js"
import { registerStatsCommand } from "./commands/stats.js"
import { registerConfigCommand } from "./commands/config.js"
import { registerDashCommand } from "./commands/dash.js"
import { ROOT_PROGRAM_DESCRIPTION } from "./commands/metadata.js"

program
  .name("crev")
  .description(ROOT_PROGRAM_DESCRIPTION)
  .version(CREV_VERSION)

registerRunCommand(program)
registerListCommand(program)
registerShowCommand(program)
registerDiffCommand(program)
registerDoctorCommand(program)
registerHelpCommand(program)
registerSchemaCommand(program)
registerInitCommand(program)
registerUpdateCommand(program)
registerStatsCommand(program)
registerConfigCommand(program)
registerDashCommand(program)

program.parse()
