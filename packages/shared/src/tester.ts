// 공용 테스터 계정 · 에이전트 공유 (P-0004). 웹 · API 가 같이 쓴다.
//
// 계정 표시는 Supabase Auth 의 app_metadata 에 있다 (포털 계정 관리가 바꾸고, 사용자는 바꿀 수 없다).
//   role = 'admin'        관리자: 에이전트를 항상 본다
//   role = 'tester'       공용 테스터 계정: 에이전트를 볼 수 없다
//   agent_share = true    관리자가 에이전트를 공유한 멤버

export type AppMetadata = Record<string, unknown> | null | undefined;

/** 에이전트(픽셀 오피스 · 잡 토큰)를 볼 수 있는 계정인지 */
export function canUseAgent(meta: AppMetadata): boolean {
  if (!meta) return false;
  if (meta.role === 'admin') return true;
  if (meta.role === 'tester') return false;
  return meta.agent_share === true;
}

/** 테스터 트리거(supabase/migrations/20261107000000_tester.sql)가 내는 오류 코드 → 화면 문장 */
export const TESTER_ERROR_TEXT: Record<string, string> = {
  AE401: '기본 데이터는 테스터가 바꿀 수 없어요',
  AE402: '테스터 계정에서는 쓸 수 없는 기능이에요',
};

/** Supabase(PostgREST) 오류를 화면에 보여 줄 문장으로. 테스터 오류는 정해진 문장, 나머지는 받은 문장 */
export function dbErrorText(error: { code?: string | null; message: string }): string {
  return (error.code && TESTER_ERROR_TEXT[error.code]) || error.message;
}
