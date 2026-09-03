/**
 * weather-report skill 的专属工具。
 * 只有加载该 skill 时，这个工具才会被注册给模型。
 *
 * 演示"skill 附带可执行脚本 + 数据文件 + 权限控制"：
 * - 本文件 = 可执行脚本（工具实现）
 * - city-codes.json = 附带数据文件（由 skills.ts 加载后经工厂注入）
 * - requiredPermission 声明该工具需要 weather:read 权限
 */

import type { Tool } from '../../src/tools.js';

// 工具通过"工厂函数"接收 skill 附带的数据（city-codes.json 的内容）
export function createWeatherTool(cityCodes: Record<string, { code: string; note: string }>): Tool[] {
  // 模拟天气数据（真实场景应接天气 API）
  const MOCK_WEATHER: Record<string, string> = {
    '北京': '25°C 晴',
    '上海': '28°C 多云',
    '广州': '31°C 阵雨',
    '深圳': '30°C 晴',
  };

  return [{
    definition: {
      type: 'function',
      function: {
        name: 'get_weather',
        description: '查询指定城市的当前天气（温度与天气状况）。',
        parameters: {
          type: 'object',
          properties: {
            city: { type: 'string', description: '城市名，如 北京' },
          },
          required: ['city'],
        },
      },
    },
    execute: async ({ city }) => {
      const name = String(city ?? '');
      const weather = MOCK_WEATHER[name] ?? '未知城市';
      const note = cityCodes[name]?.note ?? '暂无提示';
      return `天气: ${name} ${weather}。附带数据: ${note}`;
    },
  }];
}

/** 兼容导出：无数据时的默认工具（供简单场景使用） */
export const skillTools: Tool[] = createWeatherTool({});