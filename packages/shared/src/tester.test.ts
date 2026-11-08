import { describe, expect, it } from 'vitest';
import { canUseAgent, dbErrorText } from './tester';

describe('canUseAgent', () => {
  it('관리자는 항상 본다', () => {
    expect(canUseAgent({ role: 'admin' })).toBe(true);
  });
  it('공유를 켠 멤버만 본다', () => {
    expect(canUseAgent({ agent_share: true })).toBe(true);
    expect(canUseAgent({})).toBe(false);
    expect(canUseAgent({ agent_share: 'true' })).toBe(false);
    expect(canUseAgent(null)).toBe(false);
  });
  it('테스터는 공유가 켜져 있어도 못 본다', () => {
    expect(canUseAgent({ role: 'tester', agent_share: true })).toBe(false);
  });
});

describe('dbErrorText', () => {
  it('테스터 오류 코드는 정해진 문장', () => {
    expect(dbErrorText({ code: 'AE401', message: 'x' })).toBe('기본 데이터는 테스터가 바꿀 수 없어요');
    expect(dbErrorText({ code: 'AE402', message: 'x' })).toBe('테스터 계정에서는 쓸 수 없는 기능이에요');
  });
  it('나머지는 받은 문장 그대로', () => {
    expect(dbErrorText({ code: '23505', message: 'duplicate key' })).toBe('duplicate key');
    expect(dbErrorText({ message: 'network' })).toBe('network');
  });
});
