/**
 * Blessed entry wrapper that sidesteps blessed's own dynamic widget
 * loader. `blessed/lib/widget.js` loads widgets with
 * `require('./widgets/' + name)` — Bun's `--compile` can't trace
 * that pattern, so the shipped binaries crash with
 * `Cannot find module './widgets/node'` the moment blessed's
 * widget.js runs (even `import blessed from "blessed"` triggers it).
 *
 * Instead, import every widget statically here so the bundler
 * includes them, and assemble the same public surface that
 * `blessed/lib/blessed.js` normally exposes. Importing this file
 * has no other side-effects; consumers keep using `blessed` as
 * before, except now the TS code imports from this shim.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck -- blessed ships no TS types for its internals

import type blessedTypes from "blessed"
import program from "blessed/lib/program.js"
import tput from "blessed/lib/tput.js"
import colors from "blessed/lib/colors.js"
import unicode from "blessed/lib/unicode.js"
import helpers from "blessed/lib/helpers.js"

import Node from "blessed/lib/widgets/node.js"
import Screen from "blessed/lib/widgets/screen.js"
import Element from "blessed/lib/widgets/element.js"
import Box from "blessed/lib/widgets/box.js"
import Text from "blessed/lib/widgets/text.js"
import Line from "blessed/lib/widgets/line.js"
import ScrollableBox from "blessed/lib/widgets/scrollablebox.js"
import ScrollableText from "blessed/lib/widgets/scrollabletext.js"
import BigText from "blessed/lib/widgets/bigtext.js"
import List from "blessed/lib/widgets/list.js"
import Form from "blessed/lib/widgets/form.js"
import Input from "blessed/lib/widgets/input.js"
import Textarea from "blessed/lib/widgets/textarea.js"
import Textbox from "blessed/lib/widgets/textbox.js"
import Button from "blessed/lib/widgets/button.js"
import ProgressBar from "blessed/lib/widgets/progressbar.js"
import FileManager from "blessed/lib/widgets/filemanager.js"
import Checkbox from "blessed/lib/widgets/checkbox.js"
import RadioSet from "blessed/lib/widgets/radioset.js"
import RadioButton from "blessed/lib/widgets/radiobutton.js"
import Prompt from "blessed/lib/widgets/prompt.js"
import Question from "blessed/lib/widgets/question.js"
import Message from "blessed/lib/widgets/message.js"
import Loading from "blessed/lib/widgets/loading.js"
import Listbar from "blessed/lib/widgets/listbar.js"
import Log from "blessed/lib/widgets/log.js"
import Table from "blessed/lib/widgets/table.js"
import ListTable from "blessed/lib/widgets/listtable.js"
import Terminal from "blessed/lib/widgets/terminal.js"
import Image from "blessed/lib/widgets/image.js"
import ANSIImage from "blessed/lib/widgets/ansiimage.js"
import OverlayImage from "blessed/lib/widgets/overlayimage.js"
import Video from "blessed/lib/widgets/video.js"
import Layout from "blessed/lib/widgets/layout.js"

// Rebuild the same callable + namespace shape that
// blessed/lib/blessed.js exports (module.exports = blessed, where
// blessed is a function with properties attached).
function blessed(...args: unknown[]) {
  return (blessed as any).program.apply(null, args)
}

;(blessed as any).program = (blessed as any).Program = program
;(blessed as any).tput = (blessed as any).Tput = tput
;(blessed as any).colors = colors
;(blessed as any).unicode = unicode
;(blessed as any).helpers = helpers

helpers.sprintf = tput.sprintf
helpers.tryRead = tput.tryRead
helpers.merge(blessed, helpers)

// Replicate the widget namespace that blessed assembles from
// `widget.classes` + `widget.aliases`.
const widgetClasses: Record<string, unknown> = {
  Node,
  Screen,
  Element,
  Box,
  Text,
  Line,
  ScrollableBox,
  ScrollableText,
  BigText,
  List,
  Form,
  Input,
  Textarea,
  Textbox,
  Button,
  ProgressBar,
  FileManager,
  Checkbox,
  RadioSet,
  RadioButton,
  Prompt,
  Question,
  Message,
  Loading,
  Listbar,
  Log,
  Table,
  ListTable,
  Terminal,
  Image,
  ANSIImage,
  OverlayImage,
  Video,
  Layout,
}

const aliases: Record<string, string> = { ListBar: "Listbar", PNG: "ANSIImage" }

;(blessed as any).classes = Object.keys(widgetClasses)
;(blessed as any).aliases = aliases

for (const [name, cls] of Object.entries(widgetClasses)) {
  ;(blessed as any)[name] = cls
  ;(blessed as any)[name.toLowerCase()] = cls
}
for (const [alias, target] of Object.entries(aliases)) {
  ;(blessed as any)[alias] = widgetClasses[target]
  ;(blessed as any)[alias.toLowerCase()] = widgetClasses[target]
}

export default blessed as unknown as typeof blessedTypes
