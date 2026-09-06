import {it,expect} from 'vitest';
import {selectPhotoIds} from './photoSelection';
it('keeps click order, toggles Ctrl, and selects Shift range',()=>{
  expect(selectPhotoIds(['b'],'d',['a','b','c','d'],'b',{shift:true})).toEqual(['b','c','d']);
  expect(selectPhotoIds(['d'],'b',['a','b','c','d'],null,{ctrl:true})).toEqual(['d','b']);
  expect(selectPhotoIds(['d','b'],'d',['a','b','c','d'],null,{ctrl:true})).toEqual(['b']);
});
