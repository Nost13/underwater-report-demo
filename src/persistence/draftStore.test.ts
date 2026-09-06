import { expect, it } from 'vitest';
import { nextDraftRevision } from './draftStore';

it('retains the last good snapshot and prevents stale-tab overwrites', () => {
  const prior = { id: 'job1', revision: 2, title: 'ship', updatedAt: 50, value: { name: 'saved' }, previous: { name: 'older' } };
  const next = nextDraftRevision(prior, 'job1', 2, 'new ship', { name: 'new' }, 100);
  expect(next).toEqual({ id: 'job1', revision: 3, title: 'new ship', updatedAt: 100, value: { name: 'new' }, previous: { name: 'saved' } });
  expect(() => nextDraftRevision(prior, 'job1', 1, 'stale', {}, 101)).toThrow(/다른 탭/);
  expect(prior.value.name).toBe('saved');
});
it('saves navigation without replacing the previous content version',()=>{
 const prior={id:'job',revision:2,title:'ship',updatedAt:1,value:{stage:2,name:'current'},previous:{stage:1,name:'older'}};
 const next=nextDraftRevision(prior,'job',2,'ship',{stage:4,name:'current'},2,false);
 expect(next.value).toEqual({stage:4,name:'current'});expect(next.previous).toEqual(prior.previous);expect(next.revision).toBe(3);
});
