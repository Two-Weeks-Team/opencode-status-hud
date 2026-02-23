#!/usr/bin/env node

import { runCli } from "../dist/src/cli/index.js"

runCli().then((exitCode) => {
  process.exit(exitCode)
})
