#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function printUsage() {
  console.log(`Usage:
  pnpm perf:collect -- --base-url http://localhost:3000 --path /api/workplaces --path /api/shifts/form-bootstrap --repeat 3

Options:
  --base-url <url>     Base URL for requests
  --path <path>        Request path to measure (repeatable)
  --repeat <number>    Repeat count per path (default: 1)
  --cookie <value>     Cookie header value
  --output <file>      Output JSON path
`);
}

function parseArgs(argv) {
  const args = {
    baseUrl: "",
    paths: [],
    repeat: 1,
    cookie: "",
    output: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      printUsage();
      process.exit(0);
    }

    if (argument === "--base-url") {
      args.baseUrl = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (argument === "--path") {
      const value = argv[index + 1] ?? "";
      if (value) {
        args.paths.push(value);
      }
      index += 1;
      continue;
    }

    if (argument === "--repeat") {
      args.repeat = Number(argv[index + 1] ?? "1");
      index += 1;
      continue;
    }

    if (argument === "--cookie") {
      args.cookie = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (argument === "--output") {
      args.output = argv[index + 1] ?? "";
      index += 1;
    }
  }

  if (!args.baseUrl || args.paths.length === 0) {
    printUsage();
    throw new Error("base-url と path は必須です");
  }

  if (!Number.isInteger(args.repeat) || args.repeat <= 0) {
    throw new Error("repeat は 1 以上の整数で指定してください");
  }

  return args;
}

function parseServerTiming(headerValue) {
  if (!headerValue) {
    return [];
  }

  return headerValue
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [namePart, ...params] = entry.split(";");
      const durationParam = params.find((param) => param.startsWith("dur="));
      const durationMs = durationParam ? Number(durationParam.slice(4)) : null;

      return {
        name: namePart,
        durationMs:
          durationMs !== null && Number.isFinite(durationMs)
            ? durationMs
            : null,
      };
    });
}

function buildDefaultOutputPath() {
  const now = new Date();
  const dateSegment = now.toISOString().slice(0, 10).replace(/-/g, "");
  const timeSegment = now.toISOString().slice(11, 19).replace(/:/g, "-");
  return path.join(
    "performance",
    dateSegment,
    `server-timing-${timeSegment}.json`,
  );
}

async function collectOne(baseUrl, requestPath, cookie) {
  const url = new URL(requestPath, baseUrl);
  const headers = new Headers();
  if (cookie) {
    headers.set("cookie", cookie);
  }

  const startedAt = performance.now();
  const response = await fetch(url, {
    method: "GET",
    headers,
  });
  const durationMs = Number((performance.now() - startedAt).toFixed(1));

  return {
    path: requestPath,
    url: url.toString(),
    status: response.status,
    ok: response.ok,
    durationMs,
    serverTimingRaw: response.headers.get("server-timing"),
    serverTiming: parseServerTiming(response.headers.get("server-timing")),
    collectedAt: new Date().toISOString(),
  };
}

function summarize(results) {
  const lines = [];

  for (const pathResult of results.paths) {
    const responseTimes = pathResult.samples.map((sample) => sample.durationMs);
    const avgResponseMs =
      responseTimes.reduce((sum, value) => sum + value, 0) /
      responseTimes.length;
    const metricAverages = new Map();

    for (const sample of pathResult.samples) {
      for (const metric of sample.serverTiming) {
        if (metric.durationMs === null) {
          continue;
        }

        const current = metricAverages.get(metric.name) ?? [];
        current.push(metric.durationMs);
        metricAverages.set(metric.name, current);
      }
    }

    const metricsSummary = [...metricAverages.entries()]
      .map(([name, values]) => {
        const average =
          values.reduce((sum, value) => sum + value, 0) / values.length;
        return `${name}=${average.toFixed(1)}ms`;
      })
      .join(", ");

    lines.push(
      `${pathResult.path} avg=${avgResponseMs.toFixed(1)}ms${
        metricsSummary ? ` serverTiming: ${metricsSummary}` : ""
      }`,
    );
  }

  return lines;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputPath = args.output || buildDefaultOutputPath();
  const payload = {
    baseUrl: args.baseUrl,
    repeat: args.repeat,
    paths: [],
    collectedAt: new Date().toISOString(),
  };

  for (const requestPath of args.paths) {
    const samples = [];

    for (let count = 0; count < args.repeat; count += 1) {
      samples.push(await collectOne(args.baseUrl, requestPath, args.cookie));
    }

    payload.paths.push({
      path: requestPath,
      samples,
    });
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(`saved: ${outputPath}`);
  for (const line of summarize(payload)) {
    console.log(line);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
