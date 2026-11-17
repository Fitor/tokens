/**
 * 文档页脚本 URL 指向的仓库 ref（tag 或钉版 commit）。
 *
 * release 流程由 scripts/set-version.sh 在创建 tag 前把 PINNED_SCRIPTS_REF
 * 推进为 v<version>（set-version → commit → tag → deploy）；部署侧可用
 * TOKENS_SCRIPTS_REF 覆盖。永不用分支名——只钉不可变 ref。
 */
export const PINNED_SCRIPTS_REF = "v1.0.5";

const REF_PATTERN = /^(v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?|[0-9a-f]{40})$/;

function resolveScriptsRef(): string {
  const override = process.env.TOKENS_SCRIPTS_REF;
  if (!override) return PINNED_SCRIPTS_REF;
  if (REF_PATTERN.test(override)) return override;
  // 非法 ref fail-closed 回退钉版：部署 env 不得生成畸形或指向他处的下载 URL。
  console.warn(`[scriptsRef] invalid TOKENS_SCRIPTS_REF ignored: ${override}`);
  return PINNED_SCRIPTS_REF;
}

export const SCRIPTS_REF = resolveScriptsRef();
export const SCRIPTS_RAW_BASE = `https://raw.githubusercontent.com/KunoLu/tokens/${SCRIPTS_REF}`;
export const SCRIPTS_BLOB_BASE = `https://github.com/KunoLu/tokens/blob/${SCRIPTS_REF}`;
