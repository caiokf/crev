/**
 * Static import shim for every blessed widget. blessed's widget.js
 * loads widgets via `require('./widgets/' + name)` — a dynamic
 * specifier that Bun's `--compile` bundler can't trace, so the
 * standalone binaries shipped to Homebrew were missing widget
 * modules and crashed with `Cannot find module './widgets/node'`
 * the moment anything (even `crev --version`) touched the dash
 * graph.
 *
 * Importing each widget file explicitly forces the bundler to
 * include them; at runtime blessed's dynamic require then resolves
 * against the bunfs successfully. The imports have no side-effects
 * beyond populating the bundle, so the file is free to sit at the
 * top of the dash module graph.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck -- blessed's widget files are untyped JS

import "blessed/lib/widgets/node.js"
import "blessed/lib/widgets/screen.js"
import "blessed/lib/widgets/element.js"
import "blessed/lib/widgets/box.js"
import "blessed/lib/widgets/text.js"
import "blessed/lib/widgets/line.js"
import "blessed/lib/widgets/scrollablebox.js"
import "blessed/lib/widgets/scrollabletext.js"
import "blessed/lib/widgets/bigtext.js"
import "blessed/lib/widgets/list.js"
import "blessed/lib/widgets/form.js"
import "blessed/lib/widgets/input.js"
import "blessed/lib/widgets/textarea.js"
import "blessed/lib/widgets/textbox.js"
import "blessed/lib/widgets/button.js"
import "blessed/lib/widgets/progressbar.js"
import "blessed/lib/widgets/filemanager.js"
import "blessed/lib/widgets/checkbox.js"
import "blessed/lib/widgets/radioset.js"
import "blessed/lib/widgets/radiobutton.js"
import "blessed/lib/widgets/prompt.js"
import "blessed/lib/widgets/question.js"
import "blessed/lib/widgets/message.js"
import "blessed/lib/widgets/loading.js"
import "blessed/lib/widgets/listbar.js"
import "blessed/lib/widgets/log.js"
import "blessed/lib/widgets/table.js"
import "blessed/lib/widgets/listtable.js"
import "blessed/lib/widgets/terminal.js"
import "blessed/lib/widgets/image.js"
import "blessed/lib/widgets/ansiimage.js"
import "blessed/lib/widgets/overlayimage.js"
import "blessed/lib/widgets/video.js"
import "blessed/lib/widgets/layout.js"
