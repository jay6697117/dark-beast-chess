// clear_kv.ts

/**
 * 清理指定 Deno KV 数据库中特定前缀下的所有数据。
 * @param kv Deno.Kv 实例
 * @param prefix 要清理的键前缀。传入 [] 表示清理数据库中的所有数据。
 * @returns 删除的条目数量。
 */
export async function clearKvData(kv: Deno.Kv, prefix: Deno.KvKey): Promise<number> {
  console.log(`[KV 清理] 正在开始清理，目标前缀: ${JSON.stringify(prefix)}`);

  let deletedCount = 0;

  // 1. 使用 kv.list() 配合前缀来迭代所有目标键
  // { prefix: [] } 会匹配数据库中的所有键
  const entries = kv.list({ prefix });

  // 2. 遍历结果并对每个键执行删除操作
  for await (const entry of entries) {
    // 使用 kv.delete() 删除当前条目
    await kv.delete(entry.key);
    deletedCount++;

    // 如果数据量大，每隔 1000 条打印一次进度
    if (deletedCount % 1000 === 0) {
        console.log(`[KV 清理] ... 已删除 ${deletedCount} 个条目...`);
    }
  }

  console.log(`[KV 清理] ✅ 清理完成！共删除 ${deletedCount} 个条目。`);
  return deletedCount;
}

// ------------------- 执行清理的主函数 -------------------
async function runClear() {
    // Deno.openKv() 会自动连接到 Deno Deploy 上的数据库
    // 确保你的部署环境已经关联了 Deno KV 数据库
    const kv = await Deno.openKv();

    // **选择您的清理范围：**

    // 示例 A: 清空整个数据库 (所有数据)
    await clearKvData(kv, []);

    // 示例 B: 只清空特定“表”或“命名空间”下的数据
    // 例如，只清空键前缀为 ["users"] 的数据
    // await clearKvData(kv, ["users"]);

    // 清理完成后关闭连接
    kv.close();
}

// 在 Deno 环境中运行这个函数来执行清理
runClear();