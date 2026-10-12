#!/usr/bin/env node
import { run } from '../src/cli.js'

const result = await run(process.argv)
process.exitCode = result.exitCode
