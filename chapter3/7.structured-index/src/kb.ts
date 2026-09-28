import { Chunk, RaptorNode, Entity, Relation, QuerySpec } from './types.js';

export const CHUNKS: Chunk[] = [
  { id: 'c_addps', text: 'ADDPS adds four packed single-precision floating-point values. It is part of the SSE instruction set and operates on 128-bit XMM registers.' },
  { id: 'c_sse', text: 'SSE (Streaming SIMD Extensions) introduced 128-bit SIMD operations to x86, including packed floating-point arithmetic.' },
  { id: 'c_xmm', text: 'XMM0 through XMM7 are 128-bit registers used by SSE instructions for packed data.' },
  { id: 'c_osfxsr', text: 'Before running any SSE instruction, the operating system must set the CR4.OSFXSR bit to 1. Otherwise the CPU raises an invalid-opcode fault.' },
  { id: 'c_vaddps', text: 'VADDPS is the AVX extension of ADDPS. It operates on 256-bit YMM registers and uses VEX prefix encoding.' },
  { id: 'c_ymm', text: 'YMM0 through YMM15 are 256-bit registers introduced with AVX, extending the XMM registers.' },
  { id: 'c_mov', text: 'MOVAPS moves aligned packed single-precision values, while MOVUPS allows unaligned access. Both belong to the SSE data movement group.' },
  { id: 'c_cr', text: 'Control registers CR0 through CR4 govern CPU operating modes, including protection, paging, and feature enablement flags.' },
  { id: 'c_fxsave', text: 'FXSAVE and FXRSTOR save and restore the FPU, MMX, and SSE state, including XMM registers.' },
  { id: 'c_sse2', text: 'SSE2 extends SSE with double-precision floating-point and integer SIMD operations.' },
];

export const RAPTOR_NODES: RaptorNode[] = [
  {
    id: 'root', level: 2, label: 'x86 SIMD overview',
    text: 'x86 SIMD extensions: the SSE family for 128-bit packed operations, the AVX evolution to 256-bit, and system enablement via control registers.',
    children: ['mid_sse', 'mid_sys', 'mid_avx'],
    chunks: CHUNKS.map((c) => c.id),
  },
  {
    id: 'mid_sse', level: 1, label: 'SSE family',
    text: 'SSE family: ADDPS arithmetic on XMM registers, MOV data movement group, and SSE2 doubles.',
    children: ['c_addps', 'c_sse', 'c_xmm', 'c_mov', 'c_sse2'],
    chunks: ['c_addps', 'c_sse', 'c_xmm', 'c_mov', 'c_sse2'],
  },
  {
    id: 'mid_sys', level: 1, label: 'System enablement',
    text: 'System enablement: the OS sets CR4.OSFXSR before SSE use, FXSAVE preserves SSE state, and CR0-CR4 govern CPU modes.',
    children: ['c_osfxsr', 'c_cr', 'c_fxsave'],
    chunks: ['c_osfxsr', 'c_cr', 'c_fxsave'],
  },
  {
    id: 'mid_avx', level: 1, label: 'AVX evolution',
    text: 'AVX evolution: VADDPS extends ADDPS to 256-bit YMM registers with VEX encoding.',
    children: ['c_vaddps', 'c_ymm'],
    chunks: ['c_vaddps', 'c_ymm'],
  },
  ...CHUNKS.map((c): RaptorNode => ({
    id: c.id, level: 0, label: c.id, text: c.text, children: [], chunks: [c.id],
  })),
];

export const ENTITIES: Entity[] = [
  { id: 'addps', name: 'ADDPS', aliases: ['addps'], chunkIds: ['c_addps'], community: 'simd_family' },
  { id: 'sse', name: 'SSE', aliases: ['sse'], chunkIds: ['c_sse', 'c_addps', 'c_mov'], community: 'simd_family' },
  { id: 'xmm', name: 'XMM', aliases: ['xmm', 'xmm0'], chunkIds: ['c_xmm', 'c_addps', 'c_fxsave'], community: 'simd_family' },
  { id: 'cr4_osfxsr', name: 'CR4.OSFXSR', aliases: ['cr4.osfxsr', 'osfxsr'], chunkIds: ['c_osfxsr'], community: 'system' },
  { id: 'cr4', name: 'CR4', aliases: ['cr4'], chunkIds: ['c_osfxsr', 'c_cr'], community: 'system' },
  { id: 'vaddps', name: 'VADDPS', aliases: ['vaddps'], chunkIds: ['c_vaddps'], community: 'avx_line' },
  { id: 'ymm', name: 'YMM', aliases: ['ymm'], chunkIds: ['c_vaddps', 'c_ymm'], community: 'avx_line' },
  { id: 'avx', name: 'AVX', aliases: ['avx'], chunkIds: ['c_vaddps', 'c_ymm'], community: 'avx_line' },
  { id: 'mov', name: 'MOV', aliases: ['mov', 'movaps', 'movups'], chunkIds: ['c_mov'], community: 'simd_family' },
  { id: 'fxsave', name: 'FXSAVE', aliases: ['fxsave', 'fxrstor'], chunkIds: ['c_fxsave'], community: 'system' },
];

export const RELATIONS: Relation[] = [
  { from: 'addps', to: 'sse', label: 'belongs-to' },
  { from: 'sse', to: 'xmm', label: 'uses' },
  { from: 'sse', to: 'cr4_osfxsr', label: 'requires' },
  { from: 'cr4_osfxsr', to: 'cr4', label: 'part-of' },
  { from: 'vaddps', to: 'addps', label: 'extends' },
  { from: 'vaddps', to: 'ymm', label: 'uses' },
  { from: 'vaddps', to: 'avx', label: 'belongs-to' },
  { from: 'avx', to: 'sse', label: 'extends' },
  { from: 'fxsave', to: 'xmm', label: 'saves' },
  { from: 'mov', to: 'sse', label: 'belongs-to' },
];

export const QUERIES: QuerySpec[] = [
  {
    query: 'Which control register bit must the OS set before running ADDPS?',
    relevant: ['c_osfxsr'],
    kind: 'multi-hop',
  },
  {
    query: 'What registers are used by SSE?',
    relevant: ['c_xmm'],
    kind: 'synthesis',
  },
  {
    query: 'Explain SSE instructions',
    relevant: ['c_sse', 'c_addps'],
    kind: 'overview',
  },
  {
    query: 'VADDPS YMM registers VEX',
    relevant: ['c_vaddps', 'c_ymm'],
    kind: 'exact',
  },
  {
    query: 'MOVAPS MOVUPS difference',
    relevant: ['c_mov'],
    kind: 'exact',
  },
];
