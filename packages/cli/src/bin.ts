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

program
  .name("crev")
  .description("AI-powered multi-reviewer code review CLI")
  .version("0.1.0")

registerRunCommand(program)
registerListCommand(program)
registerShowCommand(program)
registerDiffCommand(program)
registerDoctorCommand(program)
registerHelpCommand(program)
registerSchemaCommand(program)
registerInitCommand(program)
registerUpdateCommand(program)

program.parse()
