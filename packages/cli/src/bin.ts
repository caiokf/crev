import { program } from "commander"
import { registerRunCommand } from "./commands/run.js"
import { registerValidateCommand } from "./commands/validate.js"
import { registerListCommand } from "./commands/list.js"
import { registerShowCommand } from "./commands/show.js"
import { registerReviewCommand } from "./commands/review.js"
import { registerDiffCommand } from "./commands/diff.js"
import { registerDoctorCommand } from "./commands/doctor.js"
import { registerHelpCommand } from "./commands/help.js"
import { registerSchemaInitCommand } from "./commands/schema-init.js"
import { registerAgentInitCommand } from "./commands/agent-init.js"
import { registerInitCommand } from "./commands/init.js"
import { registerUpdateCommand } from "./commands/update.js"

program
  .name("crev")
  .description("AI-powered multi-reviewer code review CLI")
  .version("0.1.0")

registerRunCommand(program)
registerValidateCommand(program)
registerListCommand(program)
registerShowCommand(program)
registerReviewCommand(program)
registerDiffCommand(program)
registerDoctorCommand(program)
registerHelpCommand(program)
registerSchemaInitCommand(program)
registerAgentInitCommand(program)
registerInitCommand(program)
registerUpdateCommand(program)

program.parse()
