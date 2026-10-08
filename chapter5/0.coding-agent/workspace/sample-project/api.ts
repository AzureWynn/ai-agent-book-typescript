// 样例项目：给 Agent 练手的"遗留代码"（含 3 个 TODO + 1 个 bug）
export function getUser(id: string) {
  // TODO: picks wrong table, should query users_v2
  return db.query(`SELECT * FROM users_v1 WHERE id = '${id}'`);
}
