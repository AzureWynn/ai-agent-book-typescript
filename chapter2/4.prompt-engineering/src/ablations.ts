/**
 * 消融配置（对应官方 6 个臂）：baseline + 3 个单轴 + 全部叠加。
 */

export interface AblationConfig {
  name: string;
  tone: 'default' | 'trump' | 'casual';
  randomizeWiki: boolean;
  removeToolDescriptions: boolean;
}

export const ARMS: AblationConfig[] = [
  { name: 'baseline', tone: 'default', randomizeWiki: false, removeToolDescriptions: false },
  { name: 'tone_trump', tone: 'trump', randomizeWiki: false, removeToolDescriptions: false },
  { name: 'tone_casual', tone: 'casual', randomizeWiki: false, removeToolDescriptions: false },
  { name: 'wiki_random', tone: 'default', randomizeWiki: true, removeToolDescriptions: false },
  { name: 'no_tool_desc', tone: 'default', randomizeWiki: false, removeToolDescriptions: true },
  { name: 'all_ablations', tone: 'casual', randomizeWiki: true, removeToolDescriptions: true },
];

export function armByName(name: string): AblationConfig | undefined {
  return ARMS.find((a) => a.name === name);
}