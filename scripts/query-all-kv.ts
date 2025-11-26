// query_all_kv.ts

/**
 * 查询 Deno KV 指定前缀（默认全部）下的所有数据。
 * @param kv Deno.Kv 实例
 * @param prefix 键前缀，传入 [] 查询全部
 * @returns 输出的条目数量
 */
export async function queryKvData(kv: Deno.Kv, prefix: Deno.KvKey = []): Promise<number> {
  console.log(`[KV 查询] 开始查询，目标前缀: ${JSON.stringify(prefix)}`);

  const entries = kv.list({ prefix });
  let count = 0;

  for await (const entry of entries) {
    // 逐行输出 JSON，方便后续管道处理
    console.log(JSON.stringify({
      key: entry.key,
      value: entry.value,
      versionstamp: entry.versionstamp,
    }));
    count++;

    if (count % 1000 === 0) {
      console.log(`[KV 查询] ... 已输出 ${count} 条记录`);
    }
  }

  console.log(`[KV 查询] ✅ 查询完成，总计 ${count} 条记录`);
  return count;
}

function parsePrefixFromArgs(): Deno.KvKey {
  // 支持 --prefix=<value> / -p=<value> 或紧跟参数传值
  const args = [...Deno.args];
  let raw: string | undefined;

  const kvArg = args.find((arg) => arg.startsWith('--prefix=') || arg.startsWith('-p='));
  if (kvArg) {
    raw = kvArg.split('=')[1];
  } else {
    const longIdx = args.indexOf('--prefix');
    if (longIdx !== -1 && args[longIdx + 1]) raw = args[longIdx + 1];

    const shortIdx = args.indexOf('-p');
    if (!raw && shortIdx !== -1 && args[shortIdx + 1]) raw = args[shortIdx + 1];

    // 兼容直接传入前缀的场景（无标志位）
    if (!raw && args[0] && !args[0].startsWith('-')) raw = args[0];
  }

  if (!raw) return [];

  // 优先尝试解析为 JSON 数组，便于传入复杂键
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as Deno.KvKey;
  } catch {
    // 忽略解析错误，走降级分隔逻辑
  }

  // 降级：按逗号、斜杠或点分割
  return raw.split(/[.,/]/).filter(Boolean);
}

// ------------------- 执行查询的主函数 -------------------
async function runQuery() {
  const kv = await Deno.openKv();
  try {
    const prefix = parsePrefixFromArgs();
    await queryKvData(kv, prefix);
  } catch (err) {
    console.error('[KV 查询] ❌ 查询失败:', err);
    Deno.exit(1);
  } finally {
    kv.close();
  }
}

if (import.meta.main) {
  runQuery();
}
