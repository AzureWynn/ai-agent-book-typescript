export interface LogFormat {
  name: string;
  parserName: string;
  samples: string[];
  requiredKeys: string[];
}

export const JSON_LOGS: string[] = [
  '{"timestamp": "2026-07-17T10:22:00Z", "level": "INFO", "message": "planner started"}',
  '{"timestamp": "2026-07-17T10:22:31Z", "level": "WARN", "message": "retry budget low"}',
];

export const PIPE_LOGS: string[] = [
  '2026-07-17T10:23:01Z|INFO|agent.planner|step=3|Generated plan with 5 actions',
  '2026-07-17T10:24:12Z|ERROR|tool.runner|step=7|Timeout after 30s',
];

export const PIPE_REQUIRED = ['timestamp', 'level', 'module', 'step', 'message'];

export const BRACKET_LOGS: string[] = [
  '[2026-07-17 10:24:55] (ERROR) <tool=web_search> {latency_ms=812 status=timeout} :: retrying query',
  '[2026-07-17 10:25:01] (INFO) <tool=file_reader> {latency_ms=45 status=ok} :: done',
];

export const BRACKET_REQUIRED = ['timestamp', 'level', 'tool', 'latency_ms', 'status', 'message'];

export const MIXED_STREAM: string[] = [...JSON_LOGS, ...PIPE_LOGS, ...BRACKET_LOGS];
