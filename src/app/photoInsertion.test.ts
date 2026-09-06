import {expect,it} from 'vitest';
import {insertionBeforeId} from './photoInsertion';
it.each([
 ['a','b','BEFORE','b'],['a','b','AFTER','c'],['c','b','AFTER',null],['c','a','BEFORE','a'],['a','c','AFTER',null],['b','b','AFTER','c'],
] as const)('inserts %s %s %s using the actual gap', (drag,target,edge,expected)=>{
 expect(insertionBeforeId(['a','b','c'],drag,target,edge)).toBe(expected);
});
