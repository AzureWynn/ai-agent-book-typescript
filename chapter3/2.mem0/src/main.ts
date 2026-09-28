import dotenv from "dotenv";
dotenv.config();
import { Mem0Store } from "./mem0.js";
import { MemobaseStore } from "./memobase.js";
import { MemoryType } from "./types.js";

function demoMem0() {
  console.log("\n" + "=".repeat(60));
  console.log("  mem0: ADD-only 记忆系统");
  console.log("=".repeat(60));

  const store = new Mem0Store();

  // 只加不减
  store.add("用户 Alice 喜欢火锅", { category: "food" });
  store.add("用户 Alice 在 TechCorp 工作", { category: "work" });
  store.add("用户 Alice 有两只猫", { category: "pets" });
  store.add("用户 Alice 喜欢日料", { category: "food" });

  console.log(`\n记忆总数: ${store.size}`);

  console.log("\n搜索 '火锅':");
  const results = store.search("火锅");
  results.forEach(r => console.log(`  → ${r.content} (score: ${r.score.toFixed(2)})`));

  console.log("\n搜索 '工作':");
  const results2 = store.search("工作");
  results2.forEach(r => console.log(`  → ${r.content} (score: ${r.score.toFixed(2)})`));
}

function demoMemobase() {
  console.log("\n" + "=".repeat(60));
  console.log("  memobase: 四类记忆 + Profile/Event");
  console.log("=".repeat(60));

  const store = new MemobaseStore();

  // Profile（稳定属性）
  store.addProfile("alice", { name: "Alice", age: "30", city: "Beijing" });

  // Event（时间线事件）
  store.addEvent("alice", "吃了火锅", "food");
  store.addEvent("alice", "换了新工作", "career");

  // 四类记忆
  store.add("episodic", "昨天和朋友吃了火锅", {});
  store.add("semantic", "火锅是一种烹饪方式", {});
  store.add("procedural", "切火锅食材的方法", {});
  store.add("working", "正在为火锅派对做准备", {});

  console.log(`\n记忆总数: ${store.size}`);

  // 按类型检索
  console.log("\n情景记忆:");
  store.getByType("episodic").forEach(m => console.log(`  → ${m.content} (importance: ${m.importanceScore.toFixed(2)})`));

  // 访问 → 提升重要性
  const episodic = store.getByType("episodic")[0];
  if (episodic) {
    store.access(episodic);
    console.log(`\n访问后重要性: ${episodic.importanceScore.toFixed(2)}`);
  }

  // 聚类压缩
  console.log("\n聚类压缩:");
  const summaries = store.compress("episodic", 2);
  summaries.forEach(s => console.log(`  → ${s.slice(0, 60)}...`));
}

function compare() {
  console.log("\n" + "=".repeat(60));
  console.log("  mem0 vs memobase 对比");
  console.log("=".repeat(60));

  console.log(`
┌──────────────┬──────────────────┬──────────────────┐
│              │      mem0        │     memobase      │
├──────────────┼──────────────────┼──────────────────┤
│ 写入策略     │ ADD-only         │ 按类型 + 压缩     │
│ 修改策略     │ 不修改旧记忆     │ 衰减自动"软删除"  │
│ 检索方式     │ 语义 + BM25      │ 按类型 + 重要性   │
│ 存储后端     │ ChromaDB / 云端  │ pickle / 服务端   │
│ 复杂度       │ 低               │ 高                │
│ 适用场景     │ 快速集成         │ 深度定制          │
└──────────────┴──────────────────┴──────────────────┘

核心结论：
1. mem0 简单即美德 —— 只加不减，接入简单
2. memobase 精细化管理 —— 四类记忆 + 衰减/聚类
3. 3-1 自实现是基础 —— 理解了原理才能理解框架
`);
}

function main() {
  const args = process.argv.slice(2);
  const mode = args.find(a => !a.startsWith("--")) || "compare";

  switch (mode) {
    case "mem0": demoMem0(); break;
    case "memobase": demoMemobase(); break;
    case "compare":
      demoMem0();
      demoMemobase();
      compare();
      break;
    default: console.log(`Unknown mode: ${mode}`);
  }
}

main();
