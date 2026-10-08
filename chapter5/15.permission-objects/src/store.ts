// pedo/core 对应：SQLite 之上的权限内嵌对象存储。
// 每次读写强制：租户隔离 → 角色权限 → 状态机 → 跨字段校验 → 引用完整性 → 受控反应。
// 与官方差异声明：SQLite 替代 PG（无行级安全/并发语义，思想一致）。
import Database from 'better-sqlite3';

export interface AccessContext {
  user_id: string;
  role: string;
  org_id: string;
}

export interface DataObject {
  id?: number;
  type_name: string;
  content: Record<string, unknown>;
  org_id: string;
}

export class PermissionDeniedError extends Error {}
export class ValidationError extends Error {}

type Validator = (obj: DataObject, patch: Record<string, unknown> | null, store: ObjectStore) => void;

interface TypeDef {
  allowedRoles: { create: string[]; read: string[]; update: string[] };
  transitions: Record<string, string[]>;
  validate: Validator;
}

const TRANSITIONS: Record<string, string[]> = {
  'applied': ['screened', 'rejected'],
  'screened': ['interviewed', 'rejected'],
  'interviewed': ['hired', 'rejected'],
  'rejected': [],
  'hired': [],
};

export class ObjectStore {
  private db: Database.Database;
  private types = new Map<string, TypeDef>();
  private reactions: string[] = [];

  constructor(path = ':memory:') {
    this.db = new Database(path);
    this.db.exec(`CREATE TABLE IF NOT EXISTS objects (
      id INTEGER PRIMARY KEY AUTOINCREMENT, type_name TEXT NOT NULL,
      content TEXT NOT NULL, org_id TEXT NOT NULL)`);
  }

  registerType(name: string, def: TypeDef): void {
    this.types.set(name, def);
  }

  clearAll(): void {
    this.db.exec('DELETE FROM objects');
    this.reactions = [];
  }

  countObjects(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM objects').get() as { n: number }).n;
  }

  getReactionLog(): string[] {
    return [...this.reactions];
  }

  private row(id: number): { id: number; type_name: string; content: string; org_id: string } | undefined {
    return this.db.prepare('SELECT * FROM objects WHERE id = ?').get(id) as never;
  }

  private checkTenant(objOrg: string, ctx: AccessContext): void {
    if (objOrg !== ctx.org_id) throw new PermissionDeniedError(`跨租户访问被拒（对象属 ${objOrg}，调用者属 ${ctx.org_id}）`);
  }

  private checkRole(def: TypeDef, action: 'create' | 'read' | 'update', ctx: AccessContext): void {
    if (ctx.role === 'system') return;
    if (!def.allowedRoles[action].includes(ctx.role)) {
      throw new PermissionDeniedError(`角色 ${ctx.role} 无 ${action} 权限`);
    }
  }

  create(obj: DataObject, ctx: AccessContext): DataObject {
    const def = this.types.get(obj.type_name);
    if (!def) throw new ValidationError(`未知类型 ${obj.type_name}`);
    if (obj.org_id !== ctx.org_id && ctx.role !== 'system') {
      throw new PermissionDeniedError('不能在他人租户下创建对象');
    }
    this.checkRole(def, 'create', ctx);
    def.validate(obj, null, this);
    const info = this.db.prepare('INSERT INTO objects (type_name, content, org_id) VALUES (?, ?, ?)')
      .run(obj.type_name, JSON.stringify(obj.content), obj.org_id);
    this.reactions.push(`created ${obj.type_name}#${info.lastInsertRowid} by ${ctx.user_id}`);
    return { ...obj, id: Number(info.lastInsertRowid) };
  }

  get(id: number, ctx: AccessContext): DataObject {
    const r = this.row(id);
    if (!r) throw new ValidationError(`对象 ${id} 不存在`);
    const def = this.types.get(r.type_name) as TypeDef;
    this.checkTenant(r.org_id, ctx);
    this.checkRole(def, 'read', ctx);
    return { id: r.id, type_name: r.type_name, content: JSON.parse(r.content) as Record<string, unknown>, org_id: r.org_id };
  }

  update(id: number, patch: Record<string, unknown>, ctx: AccessContext): DataObject {
    const r = this.row(id);
    if (!r) throw new ValidationError(`对象 ${id} 不存在`);
    const def = this.types.get(r.type_name) as TypeDef;
    this.checkTenant(r.org_id, ctx);
    this.checkRole(def, 'update', ctx);
    const content = JSON.parse(r.content) as Record<string, unknown>;
    // 状态机：status 只能沿允许边走
    if (typeof patch.status === 'string' && typeof content.status === 'string') {
      const allowed = TRANSITIONS[content.status] ?? [];
      if (!allowed.includes(patch.status)) {
        throw new ValidationError(`非法状态跃迁 ${content.status} -> ${patch.status}（允许：${allowed.join('、') || '无'}）`);
      }
    }
    const merged: DataObject = { id, type_name: r.type_name, content: { ...content, ...patch }, org_id: r.org_id };
    def.validate(merged, patch, this);
    this.db.prepare('UPDATE objects SET content = ? WHERE id = ?').run(JSON.stringify(merged.content), id);
    this.reactions.push(`updated ${r.type_name}#${id} by ${ctx.user_id}: ${Object.keys(patch).join(',')}`);
    if (patch.status === 'hired') this.reactions.push(`reaction: offer-letter queued for candidate#${id}（受控后果）`);
    return merged;
  }
}

// 招聘场景类型注册（官方 hiring.py 对应）：
// position 薪资带；candidate 期望薪资须落在 position 范围内 + position_id 必须存在。
export function registerHiringTypes(store: ObjectStore): void {
  store.registerType('position', {
    allowedRoles: { create: ['system'], read: ['system', 'recruiter'], update: ['system'] },
    transitions: {},
    validate: (obj) => {
      const c = obj.content;
      if (Number(c.salary_min) > Number(c.salary_max)) throw new ValidationError('salary_min 不能大于 salary_max');
    },
  });
  store.registerType('candidate', {
    allowedRoles: { create: ['system', 'recruiter'], read: ['system', 'recruiter'], update: ['system', 'recruiter'] },
    transitions: TRANSITIONS,
    validate: (obj, _patch, store) => {
      const c = obj.content;
      const posId = Number(c.position_id);
      if (!posId) throw new ValidationError('candidate 必须引用 position_id');
      let pos: DataObject;
      try {
        pos = store.get(posId, { user_id: 'system', role: 'system', org_id: obj.org_id });
      } catch {
        throw new ValidationError(`引用的 position#${posId} 不存在（引用完整性）`);
      }
      if (pos.type_name !== 'position') throw new ValidationError('position_id 必须指向 position 类型');
      const exp = Number(c.salary_expectation);
      if (exp < Number(pos.content.salary_min) || exp > Number(pos.content.salary_max)) {
        throw new ValidationError(`期望薪资 ${exp} 超出职位范围 ${pos.content.salary_min}-${pos.content.salary_max}`);
      }
    },
  });
}
