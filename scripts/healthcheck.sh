#!/bin/sh
set -eu
node --input-type=module -e 'const response = await fetch("http://127.0.0.1:" + (process.env.PORT || "3000") + "/health/ready", { signal: AbortSignal.timeout(12000) }); if (!response.ok) process.exit(1); console.log(await response.text());'
