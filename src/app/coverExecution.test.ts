import {expect,it} from 'vitest';
import {createGeneralSections,createNicheSections} from '../domain/structure';
import {createCoverInfo,syncGeneratedCoverScope} from './coverInfo';
const sections=[...createGeneralSections('CLEANING'),...createNicheSections({component:'Sea Chest',type:'SIDE_QUANTITY',quantity:2,service:'CLEANING'})];
it('uses scope names without repeating physical positions and never guesses the performer',()=>{
 const cover=syncGeneratedCoverScope(createCoverInfo(),sections);
 expect(cover.scopeTitle).toBe('General Cleaning / Sea Chest Cleaning');
 expect(cover.scopeDescription).toBe('');
});
it('generates distinct ROV and diver descriptions and retains manual edits',()=>{
 const cover=syncGeneratedCoverScope({...createCoverInfo(),scopePerformers:{'CLEANING|GENERAL':'ROV','CLEANING|NICHE|SEA CHEST':'DIVER'}},sections);
 expect(cover.scopeDescription).toBe('General cleaning was carried out using an ROV.\nSea chest cleaning was carried out by divers.');
 const manual={...cover,scopeMode:'MANUAL' as const,scopeDescription:'Checked narrative'};
 expect(syncGeneratedCoverScope(manual,sections).scopeDescription).toBe('Checked narrative');
});
